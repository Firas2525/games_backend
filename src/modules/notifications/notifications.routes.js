import { Router } from 'express';
import {
  getNotifications,
  createNotification,
  deleteNotification,
} from './notifications.controller.js';

const router = Router();

// Public / User & Admin fetch notifications
router.get('/', getNotifications);

// Admin send notification
router.post('/', createNotification);

// Admin delete notification
router.delete('/:id', deleteNotification);

export default router;
