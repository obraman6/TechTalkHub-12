import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { authenticate } from './server/auth';
import { initSchema, seedInitialData } from './server/db';
import { adminRouter } from './server/routes/adminRoutes';
import { authRouter } from './server/routes/authRoutes';
import { publicRouter } from './server/routes/publicRoutes';
import { studentRouter } from './server/routes/studentRoutes';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  initSchema();
  await seedInitialData();

  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(authenticate);

  // API routes
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api', studentRouter);
  app.use('/api', adminRouter);

  // API 404 fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler (friendly messages, technical logs kept server-side)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[TechTalkHub Server Error]', err);
    if (err.message?.includes('File too large')) {
      res.status(400).json({ error: 'Uploaded file exceeds the 2MB maximum size limit.' });
      return;
    }
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const templatePath = path.resolve(process.cwd(), 'index.html');
        let html = fs.readFileSync(templatePath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TechTalkHub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TechTalkHub server:', err);
  process.exit(1);
});
