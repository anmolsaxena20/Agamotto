import { Router } from 'express';
import passport from 'passport';
import {
  signup,
  verifyEmail,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  oauthCallback,
  logout,
  me,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();

router.post('/signup', signup);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', logout);
router.get('/me', authenticate, me);

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/auth/login?error=GoogleAuthFailed',
  }),
  oauthCallback
);

router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email'],
    session: false,
  })
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    session: false,
    failureRedirect: '/auth/login?error=GitHubAuthFailed',
  }),
  oauthCallback
);

export default router;
