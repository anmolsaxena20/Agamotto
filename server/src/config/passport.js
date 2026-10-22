import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import crypto from 'node:crypto';
import { db } from '../prisma/db.ts';
import { provisionDefaultGroups } from '../services/rbac.service.js';

export function configurePassport() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: googleCallbackUrl,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found in Google profile'), null);
            }

            const existingOAuth = await db.orm.public.OAuthAccount.where({
              provider: 'google',
              providerAccountId: profile.id,
            }).first();

            if (existingOAuth) {
              const existingUser = await db.orm.public.User.where({
                id: existingOAuth.userId,
              }).first();
              return done(null, existingUser);
            }

            let user = await db.orm.public.User.where({ email }).first();

            if (!user) {
              user = await db.orm.public.User.create({
                email,
                name: profile.displayName || email.split('@')[0],
                avatarUrl: profile.photos?.[0]?.value || null,
                isEmailVerified: true,
                status: 'ACTIVE',
              });

              const slug = `${user.email.split('@')[0]}-${crypto.randomBytes(3).toString('hex')}`.toLowerCase();
              const org = await db.orm.public.Organization.create({
                name: `${user.name || 'User'}'s Org`,
                slug,
                createdById: user.id,
              });

              const member = await db.orm.public.OrganizationMember.create({
                orgId: org.id,
                userId: user.id,
                status: 'ACTIVE',
              });

              await provisionDefaultGroups(org.id, member.id);
            }

            await db.orm.public.OAuthAccount.create({
              userId: user.id,
              provider: 'google',
              providerAccountId: profile.id,
              providerEmail: email,
              avatarUrl: profile.photos?.[0]?.value || null,
              accessToken,
              refreshToken: refreshToken || null,
            });

            return done(null, user);
          } catch (err) {
            return done(err, null);
          }
        }
      )
    );
  }

  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback';

  if (githubClientId && githubClientSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: githubClientId,
          clientSecret: githubClientSecret,
          callbackURL: githubCallbackUrl,
          scope: ['user:email'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || `${profile.username}@github.agamotto.local`;

            const existingOAuth = await db.orm.public.OAuthAccount.where({
              provider: 'github',
              providerAccountId: profile.id,
            }).first();

            if (existingOAuth) {
              const existingUser = await db.orm.public.User.where({
                id: existingOAuth.userId,
              }).first();
              return done(null, existingUser);
            }

            let user = await db.orm.public.User.where({ email }).first();

            if (!user) {
              user = await db.orm.public.User.create({
                email,
                username: profile.username || null,
                name: profile.displayName || profile.username,
                avatarUrl: profile.photos?.[0]?.value || null,
                isEmailVerified: true,
                status: 'ACTIVE',
              });

              const slug = `${(profile.username || user.email.split('@')[0])}-${crypto.randomBytes(3).toString('hex')}`.toLowerCase();
              const org = await db.orm.public.Organization.create({
                name: `${user.name || 'User'}'s Org`,
                slug,
                createdById: user.id,
              });

              const member = await db.orm.public.OrganizationMember.create({
                orgId: org.id,
                userId: user.id,
                status: 'ACTIVE',
              });

              await provisionDefaultGroups(org.id, member.id);
            }

            await db.orm.public.OAuthAccount.create({
              userId: user.id,
              provider: 'github',
              providerAccountId: profile.id,
              providerEmail: email,
              avatarUrl: profile.photos?.[0]?.value || null,
              accessToken,
              refreshToken: refreshToken || null,
            });

            return done(null, user);
          } catch (err) {
            return done(err, null);
          }
        }
      )
    );
  }
}
