import crypto from 'crypto';
import { SalaryService, SalaryWithdrawalRequest } from './salaryWithdrawal.model.js';
import { User } from '../users/users.model.js';
import { Transaction } from '../users/transactions.model.js';
import { getSettings } from '../settings/settings.service.js';
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

    let grossDollars = 0;
    if (service.withdrawalType === 'dollars') {
      grossDollars = Number(qty.toFixed(4));
    } else {
      const cUnit = Math.max(1, Number(service.coinsPerUnit) || 1000);
      const dUnit = Math.max(0.0001, Number(service.dollarsPerUnit) || 1.0);
      grossDollars = Number(((qty / cUnit) * dUnit).toFixed(4));
    }

    const feePercent = Math.max(0, Math.min(100, Number(service.feePercentage) || 0));
    const feeDollars = Number(((grossDollars * feePercent) / 100).toFixed(4));
    const netDollars = Number(Math.max(0, grossDollars - feeDollars).toFixed(4));

    const settings = await getSettings();
    const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

    const isUserSyp = req.user?.currency === 'SYP';
    let creditedAmount = netDollars;
    let creditedCurrency = 'USD';
    if (isUserSyp) {
      creditedAmount = Math.round(netDollars * exchangeRate);
      creditedCurrency = 'SYP';
    }

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
      unitName: service.unitName || (service.withdrawalType === 'coins' ? 'كوينز' : 'دولار'),
      adminReceiverId: service.adminReceiverId || '',
      withdrawalType: service.withdrawalType || 'coins',
      coinsPerUnit: service.coinsPerUnit || 1000,
      dollarsPerUnit: service.dollarsPerUnit || 1.0,
      feePercentage: feePercent,
      grossDollars,
      feeDollars,
      netDollars,
      exchangeRate,
      calculatedDollars: netDollars,
      creditedAmount,
      creditedCurrency,
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
      adminReceiverId,
      withdrawalType,
      coinsPerUnit,
      dollarsPerUnit,
      feePercentage,
      isActive,
      sortOrder,
    } = req.body;

    if (!name || !name.trim()) {
      return ApiResponse.error(res, 'اسم الخدمة مطلوب', HTTP_STATUS.BAD_REQUEST);
    }

    const cleanedFields = Array.isArray(requiredFields)
      ? requiredFields.map((f) => String(f).trim()).filter(Boolean)
      : [];

    const isCoins = (withdrawalType || 'coins') === 'coins';
    const finalUnitName = unitName && unitName.trim() ? unitName.trim() : (isCoins ? 'كوينز' : 'دولار');
    const finalFee = Math.max(0, Math.min(100, Number(feePercentage) || 0));

    const newService = await SalaryService.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      imageUrl: imageUrl ? imageUrl.trim() : '',
      requiredFields: cleanedFields,
      minQuantity: minQuantity !== undefined ? Number(minQuantity) : 1,
      maxQuantity: maxQuantity !== undefined ? Number(maxQuantity) : 10000,
      unitName: finalUnitName,
      adminReceiverId: adminReceiverId ? String(adminReceiverId).trim() : '',
      withdrawalType: isCoins ? 'coins' : 'dollars',
      coinsPerUnit: Math.max(1, Number(coinsPerUnit) || 1000),
      dollarsPerUnit: Math.max(0.0001, Number(dollarsPerUnit) || 1.0),
      feePercentage: finalFee,
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
      adminReceiverId,
      withdrawalType,
      coinsPerUnit,
      dollarsPerUnit,
      feePercentage,
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
    if (adminReceiverId !== undefined) service.adminReceiverId = String(adminReceiverId).trim();
    if (withdrawalType !== undefined) service.withdrawalType = withdrawalType === 'dollars' ? 'dollars' : 'coins';
    if (coinsPerUnit !== undefined) service.coinsPerUnit = Math.max(1, Number(coinsPerUnit) || 1000);
    if (dollarsPerUnit !== undefined) service.dollarsPerUnit = Math.max(0.0001, Number(dollarsPerUnit) || 1.0);
    if (feePercentage !== undefined) service.feePercentage = Math.max(0, Math.min(100, Number(feePercentage) || 0));
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

    // Handle Approval: Credit user wallet with calculated dollars
    if (status === 'approved') {
      if (request.isCredited) {
        return ApiResponse.success(
          res,
          {
            request,
            creditedAmount: request.creditedAmount,
            effectiveCurrency: request.creditedCurrency,
          },
          'تم اعتماد هذا الطلب وإيداع الرصيد للمستخدم مسبقاً'
        );
      }

      const user = await User.findById(request.userId);
      if (!user) {
        return ApiResponse.error(res, 'المستخدم صاحب الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
      }

      const settings = await getSettings();
      const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

      // Determine dollars amount: use netDollars, calculatedDollars, or fallback
      let dollarsAmount = Number(request.netDollars || request.calculatedDollars || 0);
      if (dollarsAmount <= 0) {
        if (request.withdrawalType === 'dollars') {
          dollarsAmount = Number(request.quantity || 0);
        } else {
          const cUnit = Math.max(1, Number(request.coinsPerUnit) || 1000);
          const dUnit = Math.max(0.0001, Number(request.dollarsPerUnit) || 1.0);
          const gross = Number(((request.quantity / cUnit) * dUnit).toFixed(4));
          const fee = (gross * (Number(request.feePercentage) || 0)) / 100;
          dollarsAmount = Number(Math.max(0, gross - fee).toFixed(4));
        }
      }

      let creditAmount = dollarsAmount;
      let effectiveCurrency = 'USD';
      if (user.currency === 'SYP') {
        creditAmount = Math.round(dollarsAmount * exchangeRate);
        effectiveCurrency = 'SYP';
      }

      const prevBal = Number((user.balance || 0).toFixed(4));
      const newBal = Number((prevBal + creditAmount).toFixed(4));

      user.balance = newBal;
      await user.save();

      const unitLabel = request.unitName || (request.withdrawalType === 'coins' ? 'كوينز' : 'دولار');
      const feeNote = request.feePercentage > 0 ? ` [خصم عمولة ${request.feePercentage}%]` : '';
      const sypNote = user.currency === 'SYP' ? ` [سعر الصرف: 1$ = ${exchangeRate} ل.س]` : '';

      // Create deposit transaction in user history
      const transaction = await Transaction.create({
        userId: user._id,
        adminId: req.user?._id,
        type: 'deposit',
        currency: effectiveCurrency,
        amount: creditAmount,
        previousBalance: prevBal,
        newBalance: newBal,
        note: `إيداع سحب أرباح تطبيقات (${request.serviceName}) - ${request.quantity} ${unitLabel}${feeNote} = ${creditAmount} ${effectiveCurrency}${sypNote} [طلب #${request.requestId}]`,
      });

      request.isCredited = true;
      request.creditedAmount = creditAmount;
      request.creditedCurrency = effectiveCurrency;
      request.transactionId = transaction._id;
      request.status = 'approved';
      if (adminNotes !== undefined) {
        request.adminNotes = adminNotes ? String(adminNotes).trim() : '';
      }
      await request.save();

      return ApiResponse.success(
        res,
        {
          request,
          creditedAmount: creditAmount,
          effectiveCurrency,
          newBalance: newBal,
        },
        `تم قبول الطلب واعتماده بنجاح، وتمت إضافة ${creditAmount} ${effectiveCurrency} إلى رصيد المستخدم 💵`
      );
    }

    if (request.isCredited && status !== 'approved') {
      return ApiResponse.error(
        res,
        'لا يمكن إلغاء أو رفض طلب تم اعتماده وإيداع رصيده في محفظة المستخدم بالفعل',
        HTTP_STATUS.BAD_REQUEST
      );
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

