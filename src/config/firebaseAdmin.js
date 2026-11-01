import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../modules/users/users.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseApp = null;

try {
  let credentials = null;

  // 1. Check environment variable (for Cloud / Render deployment)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT env JSON:', e.message);
    }
  }

  // 2. Fallback to local serviceAccountKey.json file
  if (!credentials) {
    const localKeyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(localKeyPath)) {
      const rawData = fs.readFileSync(localKeyPath, 'utf8');
      credentials = JSON.parse(rawData);
    }
  }

  if (credentials) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully for project:', credentials.project_id);
  } else {
    console.warn('[FirebaseAdmin] No service account key found. Push notifications will be disabled until configured.');
  }
} catch (error) {
  console.error('[FirebaseAdmin] Initialization error:', error.message);
}

/**
 * Send push notification to all admins subscribed to 'admin_orders' topic
 * @param {Object} options
 * @param {string} options.title Notification title
 * @param {string} options.body Notification body
 * @param {Object} [options.data] Key-value pairs for payload (strings only)
 */
export const sendAdminNotification = async ({ title, body, data = {} }) => {
  if (!firebaseApp) {
    console.warn('[FirebaseAdmin] Skipped sendAdminNotification: Firebase Admin not initialized.');
    return { success: false, reason: 'uninitialized' };
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

    // 1. Send to 'admin_orders' topic
    try {
      topicResponse = await admin.messaging().send(message);
      console.log('[FirebaseAdmin] Notification sent successfully to admin_orders topic:', topicResponse);
    } catch (tErr) {
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
      }
    } catch (tokErr) {
      console.error('[FirebaseAdmin] Error sending direct token multicast:', tokErr.message);
    }

    return {
      success: Boolean(topicResponse || directDeliveryCount > 0),
      topicMessageId: topicResponse,
      directDeliveryCount,
    };
  } catch (error) {
    console.error('[FirebaseAdmin] Failed to send push notification:', error.message);
    return { success: false, error: error.message };
  }
};

export default admin;

