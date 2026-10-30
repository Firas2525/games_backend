import { Router } from 'express';
import {
  register,
  login,
  getMe,
  adminLoginHandler,
  verify2faLoginHandler,
  googleLoginHandler,
  setup2faHandler,
  enable2faHandler,
  disable2faHandler,
} from './auth.controller.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/google', googleLoginHandler);
router.post('/2fa/verify-login', verify2faLoginHandler);
router.post('/2fa/setup', authenticate, setup2faHandler);
router.post('/2fa/enable', authenticate, enable2faHandler);
router.post('/2fa/disable', authenticate, disable2faHandler);
router.post('/admin/login', validate(loginSchema), adminLoginHandler);
router.get('/me', authenticate, getMe);

export default router;
