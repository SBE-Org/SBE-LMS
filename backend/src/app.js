import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import mongoose from 'mongoose';
import { config } from './config.js';
import { HttpError } from './utils/http.js';
import { UPLOAD_TYPES } from './services/files.js';
import { User } from './models/index.js';

import authRoutes from './routes/auth.js';
import installRoutes from './routes/install.js';
import dashboardRoutes from './routes/dashboard.js';
import learnRoutes from './routes/learn.js';
import quizRoutes from './routes/quiz.js';
import certificateRoutes from './routes/certificates.js';
import manageRoutes from './routes/manage.js';
import quizBuilderRoutes from './routes/quizBuilder.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin requests, curl and server-to-server calls have no Origin header.
        if (!origin || config.clientUrls.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      exposedHeaders: ['Content-Disposition'],
    })
  );
  app.use(express.json({ limit: '2mb' }));
  if (config.nodeEnv !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/', (req, res) => res.json({ name: `${config.appName} API`, status: 'ok' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' }));

  // Public settings the frontend needs before sign-in
  app.get('/api/meta', async (req, res) => {
    res.json({
      appName: config.appName,
      company: config.company,
      installed: !!(await User.exists({})),
      maxUploadMb: config.maxUploadMb,
      uploadTypes: Object.keys(UPLOAD_TYPES),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/install', installRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api', learnRoutes); // /courses, /lessons
  app.use('/api', quizRoutes); // /quizzes, /attempts
  app.use('/api', certificateRoutes); // /certificates, /verify
  app.use('/api/manage', manageRoutes);
  app.use('/api/manage', quizBuilderRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/reports', reportRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'We could not find that page.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `The file is larger than ${config.maxUploadMb} MB.` : 'The file could not be uploaded.';
      return res.status(413).json({ error: msg, errors: [msg] });
    }
    if (err instanceof mongoose.Error.CastError) {
      return res.status(404).json({ error: 'We could not find that page.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request was not valid JSON.' });
    }
    console.error('[shaggar-lms]', err);
    res.status(500).json({
      error: config.isProd ? 'Something went wrong. Please try again.' : String(err?.message || err),
    });
  });

  return app;
}
