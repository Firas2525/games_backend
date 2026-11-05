import { Notification } from './notifications.model.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { sendBroadcastNotificationToUsers } from '../../config/firebaseAdmin.js';

export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100);

    return ApiResponse.success(res, notifications, 'تم جلب الإشعارات بنجاح');
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req, res, next) => {
  try {
    const { title, description, type } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return ApiResponse.error(res, 'عنوان الإشعار مطلوب', 400);
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return ApiResponse.error(res, 'تفاصيل الإشعار مطلوبة', 400);
    }

    const notification = await Notification.create({
      title: title.trim(),
      description: description.trim(),
      type: type || 'broadcast',
      isActive: true,
    });

    // Send real live push notification with sound & vibration to all users
    sendBroadcastNotificationToUsers({
      title: title.trim(),
      body: description.trim(),
      data: {
        notificationId: String(notification._id),
        type: type || 'broadcast',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    }).catch((err) => {
      console.error('[Push Notifications Error]:', err.message);
    });

    return ApiResponse.success(res, notification, 'تم إرسال الإشعار بنجاح وإيصاله لجميع المستخدمين', 201);
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return ApiResponse.error(res, 'الإشعار غير موجود', 404);
    }

    return ApiResponse.success(res, { id }, 'تم حذف الإشعار بنجاح');
  } catch (error) {
    next(error);
  }
};
