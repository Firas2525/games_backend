import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../modules/users/users.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseApp = null;
const initStatus = {
  initialized: false,
  projectId: null,
  source: null,
  error: null,
  initializedAt: null,
};

try {
  let credentials = null;

  // 1. Check environment variable (for Cloud / Render deployment)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (rawEnv.startsWith('{')) {
        credentials = JSON.parse(rawEnv);
      } else {
        // Try base64 decoding
        const decoded = Buffer.from(rawEnv, 'base64').toString('utf8');
        credentials = JSON.parse(decoded);
      }
      initStatus.source = 'env';
    } catch (e) {
      initStatus.error = `Env parse error: ${e.message}`;
      console.error('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT env:', e.message);
    }
  }

  // 2. Fallback to local serviceAccountKey.json file
  if (!credentials) {
    const localKeyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(localKeyPath)) {
      try {
        const rawData = fs.readFileSync(localKeyPath, 'utf8');
        credentials = JSON.parse(rawData);
        initStatus.source = 'local_file';
      } catch (fErr) {
        initStatus.error = `File parse error: ${fErr.message}`;
      }
    }
  }

  if (credentials) {
    // Fix escaped newlines in RSA private key (very common on Render / Heroku envs)
    if (credentials.private_key && typeof credentials.private_key === 'string') {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
    initStatus.initialized = true;
    initStatus.projectId = credentials.project_id;
    initStatus.initializedAt = new Date().toISOString();
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully for project:', credentials.project_id);
  } else {
    if (!initStatus.error) {
      initStatus.error = 'No service account key found in env (FIREBASE_SERVICE_ACCOUNT) or local file.';
    }
    console.warn('[FirebaseAdmin] No service account key found. Push notifications will be disabled until configured.');
  }
} catch (error) {
  initStatus.error = `Initialization exception: ${error.message}`;
  console.error('[FirebaseAdmin] Initialization error:', error.message);
}

/**
 * Get diagnostics about FCM configuration and active admin tokens
 */
export const getFcmDiagnostics = async () => {
  let adminTokens = [];
  try {
    const admins = await User.find({
      role: 'admin',
      fcmToken: { $exists: true, $nin: ['', null] },
    }).select('name email fcmToken updatedAt').lean();

    adminTokens = admins.map((a) => ({
      name: a.name,
      email: a.email,
      tokenPreview: a.fcmToken ? `${a.fcmToken.slice(0, 14)}...` : '',
      tokenLength: a.fcmToken ? a.fcmToken.length : 0,
      updatedAt: a.updatedAt,
    }));
  } catch (e) {
    console.error('[FirebaseAdmin] Error fetching admin tokens for diagnostics:', e.message);
  }

  return {
    ...initStatus,
    hasEnvVar: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    envVarLength: process.env.FIREBASE_SERVICE_ACCOUNT ? process.env.FIREBASE_SERVICE_ACCOUNT.length : 0,
    registeredAdminTokensCount: adminTokens.length,
    adminsWithTokens: adminTokens,
  };
};

/**
 * Send push notification to all admins subscribed to 'admin_orders' topic and direct tokens
 * @param {Object} options
 * @param {string} options.title Notification title
 * @param {string} options.body Notification body
 * @param {Object} [options.data] Key-value pairs for payload (strings only)
 */
export const sendAdminNotification = async ({ title, body, data = {} }) => {
  if (!firebaseApp) {
    console.warn('[FirebaseAdmin] Skipped sendAdminNotification: Firebase Admin not initialized. Reason:', initStatus.error);
    return { success: false, reason: initStatus.error || 'uninitialized' };
  }

  try {
    const stringifiedData = Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')])
    );

    const message = {
      topic: 'admin_orders',
      notification: {
        title,
        body,
      },
      data: stringifiedData,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'admin_notifications',
          priority: 'max',
          defaultVibrateTimings: true,
          defaultSound: true,
        },
      },
    };

    let topicResponse = null;
    let directDeliveryCount = 0;
    let errors = [];

    // 1. Send to 'admin_orders' topic
    try {
      topicResponse = await admin.messaging().send(message);
      console.log('[FirebaseAdmin] Notification sent successfully to admin_orders topic:', topicResponse);
    } catch (tErr) {
      errors.push(`Topic error: ${tErr.message}`);
      console.error('[FirebaseAdmin] Error sending to admin_orders topic:', tErr.message);
    }

    // 2. Also send directly to active admin device tokens (instant, zero propagation delay)
    try {
      const adminUsers = await User.find({
        role: 'admin',
        fcmToken: { $exists: true, $nin: ['', null] },
      }).select('fcmToken name').lean();

      const tokens = [...new Set(adminUsers.map((u) => u.fcmToken).filter(Boolean))];
      if (tokens.length > 0) {
        const multicastMessage = {
          tokens,
          notification: {
            title,
            body,
          },
          data: stringifiedData,
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'admin_notifications',
              priority: 'max',
              defaultVibrateTimings: true,
              defaultSound: true,
            },
          },
        };

        const multiRes = await admin.messaging().sendEachForMulticast(multicastMessage);
        directDeliveryCount = multiRes.successCount;
        console.log(`[FirebaseAdmin] Direct token multicast sent to ${tokens.length} admins. Success: ${multiRes.successCount}, Fail: ${multiRes.failureCount}`);
        if (multiRes.failureCount > 0) {
          multiRes.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.warn(`[FirebaseAdmin] Token [${tokens[idx].slice(0, 10)}] failed:`, resp.error?.message);
            }
          });
        }
      }
    } catch (tokErr) {
      errors.push(`Direct token error: ${tokErr.message}`);
      console.error('[FirebaseAdmin] Error sending direct token multicast:', tokErr.message);
    }

    const isSuccess = Boolean(topicResponse || directDeliveryCount > 0);
    return {
      success: isSuccess,
      topicMessageId: topicResponse,
      directDeliveryCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('[FirebaseAdmin] Failed to send push notification:', error.message);
    return { success: false, error: error.message };
  }
};

export default admin;
