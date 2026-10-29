import crypto from 'crypto';
import { SalaryService, SalaryWithdrawalRequest } from './salaryWithdrawal.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

// ==================== USER CONTROLLERS ====================

/**
 * Get all active salary withdrawal services / games
 */
export const getActiveSalaryServices = async (req, res) => {
  try {
    const services = await SalaryService.find({ isActive: true }).sort({
      sortOrder: 1,
      createdAt: -1,
    });
    return ApiResponse.success(res, services, 'Active salary services retrieved');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Submit a salary withdrawal request
 */
export const submitSalaryWithdrawal = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { serviceId, quantity, fieldsData } = req.body;

    if (!serviceId) {
      return ApiResponse.error(res, 'يجب تحديد الخدمة أو اللعبة', HTTP_STATUS.BAD_REQUEST);
    }

    const service = await SalaryService.findById(serviceId);
    if (!service || !service.isActive) {
      return ApiResponse.error(
        res,
        'الخدمة المطلوبة غير متوفرة أو معطلة حالياً',
        HTTP_STATUS.NOT_FOUND
      );
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return ApiResponse.error(res, 'يرجى إدخال كمية صحيحة', HTTP_STATUS.BAD_REQUEST);
    }

    if (qty < service.minQuantity) {
      return ApiResponse.error(
        res,
        `أقل كمية مسموح بسحبها هي ${service.minQuantity}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (qty > service.maxQuantity) {
      return ApiResponse.error(
        res,
        `أكبر كمية مسموح بسحبها هي ${service.maxQuantity}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Validate required fields
    const submittedFields = fieldsData && typeof fieldsData === 'object' ? fieldsData : {};
    if (Array.isArray(service.requiredFields) && service.requiredFields.length > 0) {
      for (const fieldName of service.requiredFields) {
        const val = submittedFields[fieldName];
        if (!val || String(val).trim() === '') {
          return ApiResponse.error(
            res,
            `الحقل مطلوب: ${fieldName}`,
            HTTP_STATUS.BAD_REQUEST
          );
        }
      }
    }

    // Generate readable request ID (e.g. SAL-AB12CD)
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const requestId = `SAL-${Date.now().toString().slice(-4)}${randomHex}`;

    const newRequest = await SalaryWithdrawalRequest.create({
      requestId,
      userId,
      userName: req.user?.name || '',
      userEmail: req.user?.email || '',
      userPhone: req.user?.phone || '',
      userDisplayId: req.user?._id?.toString() || '',
      serviceId: service._id,
      serviceName: service.name,
      serviceImage: service.imageUrl || '',
      quantity: qty,
      fieldsData: submittedFields,
      status: 'pending',
    });

    return ApiResponse.created(
      res,
      newRequest,
      'تم إرسال طلب سحب الراتب بنجاح وهو قيد المراجعة'
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Get user's own withdrawal requests
 */
export const getMySalaryWithdrawals = async (req, res) => {
  try {
    const userId = req.user?._id;
    const requests = await SalaryWithdrawalRequest.find({ userId }).sort({
      createdAt: -1,
    });
    return ApiResponse.success(res, requests, 'User withdrawal requests retrieved');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

// ==================== ADMIN CONTROLLERS ====================

/**
 * Get all services (Admin)
 */
export const getAllSalaryServicesAdmin = async (req, res) => {
  try {
    const services = await SalaryService.find().sort({ sortOrder: 1, createdAt: -1 });
    return ApiResponse.success(res, services, 'All salary services retrieved for admin');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Create a new salary withdrawal service (Admin)
 */
export const createSalaryService = async (req, res) => {
  try {
    const {
      name,
      description,
      imageUrl,
      requiredFields,
      minQuantity,
      maxQuantity,
      unitName,
      isActive,
      sortOrder,
    } = req.body;

    if (!name || !name.trim()) {
      return ApiResponse.error(res, 'اسم الخدمة مطلوب', HTTP_STATUS.BAD_REQUEST);
    }

    const cleanedFields = Array.isArray(requiredFields)
      ? requiredFields.map((f) => String(f).trim()).filter(Boolean)
      : [];

    const newService = await SalaryService.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      imageUrl: imageUrl ? imageUrl.trim() : '',
      requiredFields: cleanedFields,
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : 1,
      maxQuantity: maxQuantity !== undefined ? Number(maxQuantity) : 10000,
      unitName: unitName ? unitName.trim() : 'كمية',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
    });

    return ApiResponse.created(res, newService, 'تم إنشاء خدمة سحب الراتب بنجاح');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Update an existing salary withdrawal service (Admin)
 */
export const updateSalaryService = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      imageUrl,
      requiredFields,
      minQuantity,
      maxQuantity,
      unitName,
      isActive,
      sortOrder,
    } = req.body;

    const service = await SalaryService.findById(id);
    if (!service) {
      return ApiResponse.error(res, 'الخدمة غير موجودة', HTTP_STATUS.NOT_FOUND);
    }

    if (name !== undefined) service.name = name.trim();
    if (description !== undefined) service.description = description.trim();
    if (imageUrl !== undefined) service.imageUrl = imageUrl.trim();
    if (requiredFields !== undefined && Array.isArray(requiredFields)) {
      service.requiredFields = requiredFields.map((f) => String(f).trim()).filter(Boolean);
    }
    if (minQuantity !== undefined) service.minQuantity = Number(minQuantity);
    if (maxQuantity !== undefined) service.maxQuantity = Number(maxQuantity);
    if (unitName !== undefined) service.unitName = unitName.trim();
    if (isActive !== undefined) service.isActive = Boolean(isActive);
    if (sortOrder !== undefined) service.sortOrder = Number(sortOrder);

    await service.save();

    return ApiResponse.success(res, service, 'تم تحديث بيانات الخدمة بنجاح');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Delete a salary withdrawal service (Admin)
 */
export const deleteSalaryService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await SalaryService.findByIdAndDelete(id);
    if (!service) {
      return ApiResponse.error(res, 'الخدمة غير موجودة', HTTP_STATUS.NOT_FOUND);
    }
    return ApiResponse.success(res, null, 'تم حذف الخدمة بنجاح');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Get all salary withdrawal requests (Admin)
 */
export const getAllSalaryWithdrawalsAdmin = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      filter.$or = [
        { requestId: { $regex: term, $options: 'i' } },
        { userName: { $regex: term, $options: 'i' } },
        { userEmail: { $regex: term, $options: 'i' } },
        { userPhone: { $regex: term, $options: 'i' } },
        { serviceName: { $regex: term, $options: 'i' } },
      ];
    }

    const requests = await SalaryWithdrawalRequest.find(filter).sort({ createdAt: -1 });
    return ApiResponse.success(res, requests, 'Withdrawal requests retrieved for admin');
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

/**
 * Update request status (Admin: approve, reject, pending)
 */
export const updateSalaryWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return ApiResponse.error(
        res,
        'الحالة غير صحيحة، يجب أن تكون pending أو approved أو rejected',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const request = await SalaryWithdrawalRequest.findById(id);
    if (!request) {
      return ApiResponse.error(res, 'الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
    }

    request.status = status;
    if (adminNotes !== undefined) {
      request.adminNotes = adminNotes ? String(adminNotes).trim() : '';
    }

    await request.save();

    const statusAr =
      status === 'approved' ? 'قبول' : status === 'rejected' ? 'رفض' : 'قيد الانتظار';

    return ApiResponse.success(
      res,
      request,
      `تم تغيير حالة الطلب إلى "${statusAr}" بنجاح`
    );
  } catch (error) {
    return ApiResponse.error(res, error.message);
  }
};

