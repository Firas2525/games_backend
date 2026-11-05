import { VerificationRequest } from './verification.model.js';
import { User } from '../users/users.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { getSettings } from '../settings/settings.service.js';
import { sendAdminNotification } from '../../config/firebaseAdmin.js';

/**
 * Normalization helper for dynamic verification fields
 */
export const normalizeField = (field, index = 0) => {
  if (typeof field === 'string') {
    const trimmed = field.trim();
    if (!trimmed) return null;
    return {
      id: trimmed,
      name: trimmed,
      type: 'text',
      required: true,
    };
  }
  if (field && typeof field === 'object') {
    const name = (field.name || field.label || '').toString().trim();
    if (!name) return null;
    const id = (field.id || name).toString().trim();
    const type = field.type === 'image' ? 'image' : 'text';
    const required = field.required !== false;
    return { id, name, type, required };
  }
  return null;
};

export const normalizeFieldsList = (fields) => {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f, i) => normalizeField(f, i))
    .filter(Boolean);
};

/**
 * Get verification required fields
 */
export const getVerificationFields = async (req, res) => {
  try {
    const settings = await getSettings();
    let requiredFields = normalizeFieldsList(settings.verificationRequiredFields);
    if (requiredFields.length === 0) {
      requiredFields = [
        { id: 'full_name', name: 'الاسم الثلاثي', type: 'text', required: true }
      ];
    }

    return ApiResponse.success(
      res,
      { requiredFields },
      'Verification required fields retrieved successfully'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Update verification required fields (Admin)
 */
export const updateVerificationFields = async (req, res) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) {
      return ApiResponse.error(
        res,
        'يجب إرسال قائمة بالحقول المطلوبة كـ مصفوفة (Array)',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const cleanedFields = normalizeFieldsList(fields);

    const settings = await getSettings();
    settings.verificationRequiredFields = cleanedFields;
    await settings.save();

    return ApiResponse.success(
      res,
      { requiredFields: cleanedFields },
      'تم تحديث حقول التوثيق المطلوبة بنجاح ⚙️'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Submit an account verification request (User)
 */
export const submitVerificationRequest = async (req, res) => {
  try {
    const userId = req.user?._id;
    let { documentUrl, notes, fieldsData } = req.body;

    // Parse fieldsData if sent as string
    if (typeof fieldsData === 'string') {
      try {
        fieldsData = JSON.parse(fieldsData);
      } catch (e) {
        fieldsData = {};
      }
    }
    fieldsData = fieldsData && typeof fieldsData === 'object' ? fieldsData : {};

    // Validate required fields from system settings
    const settings = await getSettings();
    let requiredFields = normalizeFieldsList(settings.verificationRequiredFields);
    if (requiredFields.length === 0) {
      requiredFields = [
        { id: 'full_name', name: 'الاسم الثلاثي', type: 'text', required: true }
      ];
    }

    for (const field of requiredFields) {
      if (!field.required) continue;
      const val = fieldsData[field.name] || fieldsData[field.id];
      if (!val || typeof val !== 'string' || !val.trim()) {
        return ApiResponse.error(
          res,
          field.type === 'image'
            ? `يرجى إرفاق صورة (${field.name})`
            : `يرجى تعبئة الحقل المطلوب: (${field.name})`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }

    // If documentUrl is not explicitly sent, check if any image field was submitted
    if (!documentUrl || typeof documentUrl !== 'string' || !documentUrl.trim()) {
      for (const field of requiredFields) {
        if (field.type === 'image') {
          const imgVal = fieldsData[field.name] || fieldsData[field.id];
          if (imgVal && typeof imgVal === 'string' && imgVal.trim()) {
            documentUrl = imgVal.trim();
            break;
          }
        }
      }
    }

    const hasImageFields = requiredFields.some((f) => f.type === 'image' && f.required);
    if (hasImageFields && (!documentUrl || typeof documentUrl !== 'string' || !documentUrl.trim())) {
      return ApiResponse.error(
        res,
        'يرجى إرفاق صورة وثيقة إثبات الشخصية المطلوبة',
        HTTP_STATUS.BAD_REQUEST
      );
    }
    documentUrl = documentUrl ? documentUrl.trim() : '';

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.error(res, 'المستخدم غير موجود', HTTP_STATUS.NOT_FOUND);
    }

    if (user.isVerified) {
      return ApiResponse.error(
        res,
        'حسابك موثق بالفعل ✅',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Check if there is already an active pending request
    const existingPending = await VerificationRequest.findOne({
      userId,
      status: 'pending',
    });

    if (existingPending) {
      return ApiResponse.error(
        res,
        'لديك طلب توثيق قيد المراجعة حالياً من قبل الإدارة',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const newRequest = await VerificationRequest.create({
      userId: user._id,
      userName: user.name || '',
      userEmail: user.email || '',
      userPhone: user.phone || '',
      userCode: user.userCode || (user._id ? user._id.toString().slice(-6) : ''),
      documentUrl: documentUrl.trim(),
      fieldsData,
      notes: notes ? String(notes).trim() : '',
      status: 'pending',
    });

    user.verificationStatus = 'pending';
    user.verificationDocumentUrl = documentUrl.trim();
    user.verificationRejectionReason = '';
    await user.save();

    sendAdminNotification({
      title: 'طلب توثيق حساب جديد 🛡️',
      body: `طلب توثيق حساب من ${user.name || 'مستخدم'} (${user.userCode || 'ID'})`,
      data: {
        requestId: String(newRequest._id),
        type: 'verification_request',
        userName: String(user.name || ''),
      },
    }).catch((err) => console.error('[Verification Notification Error]:', err));

    return ApiResponse.created(
      res,
      newRequest,
      'تم إرسال طلب التوثيق بنجاح وهو قيد المراجعة من قبل الإدارة ✨'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Get current user's verification status & history (User)
 */
export const getMyVerificationStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.error(res, 'المستخدم غير موجود', HTTP_STATUS.NOT_FOUND);
    }

    const [requests, settings] = await Promise.all([
      VerificationRequest.find({ userId }).sort({ createdAt: -1 }),
      getSettings(),
    ]);
    const latestRequest = requests.length > 0 ? requests[0] : null;

    let requiredFields = normalizeFieldsList(settings.verificationRequiredFields);
    if (requiredFields.length === 0) {
      requiredFields = [
        { id: 'full_name', name: 'الاسم الثلاثي', type: 'text', required: true }
      ];
    }

    return ApiResponse.success(
      res,
      {
        isVerified: Boolean(user.isVerified),
        verificationStatus: user.verificationStatus || (user.isVerified ? 'verified' : 'unverified'),
        verificationDocumentUrl: user.verificationDocumentUrl || (latestRequest ? latestRequest.documentUrl : ''),
        verificationRejectionReason: user.verificationRejectionReason || (latestRequest?.status === 'rejected' ? latestRequest.rejectionReason : ''),
        verifiedAt: user.verifiedAt || null,
        requiredFields,
        latestRequest,
        requests,
      },
      'Verification status retrieved successfully'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Get all verification requests with filtering (Admin)
 */
export const getAdminVerificationRequests = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      filter.$or = [
        { userName: { $regex: term, $options: 'i' } },
        { userEmail: { $regex: term, $options: 'i' } },
        { userPhone: { $regex: term, $options: 'i' } },
        { userCode: { $regex: term, $options: 'i' } },
      ];
    }

    const [requests, allCount, pendingCount, approvedCount, rejectedCount, settings] = await Promise.all([
      VerificationRequest.find(filter).sort({ createdAt: -1 }).lean(),
      VerificationRequest.countDocuments(),
      VerificationRequest.countDocuments({ status: 'pending' }),
      VerificationRequest.countDocuments({ status: 'approved' }),
      VerificationRequest.countDocuments({ status: 'rejected' }),
      getSettings(),
    ]);

    let requiredFields = normalizeFieldsList(settings.verificationRequiredFields);
    if (requiredFields.length === 0) {
      requiredFields = [
        { id: 'full_name', name: 'الاسم الثلاثي', type: 'text', required: true }
      ];
    }

    return ApiResponse.success(
      res,
      {
        requests,
        requiredFields,
        counts: {
          all: allCount,
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
      },
      'Admin verification requests retrieved successfully'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Approve or Reject a verification request (Admin)
 */
export const updateVerificationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return ApiResponse.error(
        res,
        'يجب تحديد الحالة: approved (قبول) أو rejected (رفض)',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const request = await VerificationRequest.findById(id);
    if (!request) {
      return ApiResponse.error(res, 'طلب التوثيق غير موجود', HTTP_STATUS.NOT_FOUND);
    }

    const user = await User.findById(request.userId);
    if (!user) {
      return ApiResponse.error(res, 'المستخدم صاحب الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
    }

    const adminName = req.user?.name || 'الإدارة';

    if (status === 'approved') {
      // Approval: no reason required, change user to verified
      request.status = 'approved';
      request.rejectionReason = '';
      request.reviewedBy = req.user?._id;
      request.reviewedByName = adminName;
      request.reviewedAt = new Date();
      await request.save();

      user.isVerified = true;
      user.verificationStatus = 'verified';
      user.verifiedAt = new Date();
      user.verificationRejectionReason = '';
      await user.save();

      return ApiResponse.success(
        res,
        { request, user },
        'تم قبول طلب التوثيق بنجاح وأصبح الحساب موثقاً رسمياً ✅'
      );
    } else {
      // Rejection: reason is required
      if (!rejectionReason || !rejectionReason.trim()) {
        return ApiResponse.error(
          res,
          'يرجى كتابة سبب رفض طلب التوثيق ليتمكن المستخدم من معرفته وتصحيحه',
          HTTP_STATUS.BAD_REQUEST
        );
      }

      request.status = 'rejected';
      request.rejectionReason = rejectionReason.trim();
      request.reviewedBy = req.user?._id;
      request.reviewedByName = adminName;
      request.reviewedAt = new Date();
      await request.save();

      user.isVerified = false;
      user.verificationStatus = 'rejected';
      user.verificationRejectionReason = rejectionReason.trim();
      await user.save();

      return ApiResponse.success(
        res,
        { request, user },
        'تم رفض طلب التوثيق وتسجيل السبب بنجاح'
      );
    }
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

