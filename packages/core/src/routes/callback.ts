/**
 * @fileoverview This file is used to configure routes handle the callback via form submission
 * (POST request) from the authentication provider.
 */

import type Koa from 'koa';
import { experience } from '@logto/schemas';
import { koaBody } from 'koa-body';
import Router from 'koa-router';
import type { Provider } from 'oidc-provider';
import { z } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import { resolveSessionRedirectUrl } from '#src/middleware/koa-spa-session-guard.js';
import type Queries from '#src/tenants/Queries.js';
import assertThat from '#src/utils/assert-that.js';

// Edited from https://stackoverflow.com/a/74743075/12514940
function isStringRecord(object: unknown): object is Record<string, string> {
  if (typeof object !== 'object' || object === null) {
    return false;
  }

  if (Array.isArray(object)) {
    return false;
  }

  if (Object.getOwnPropertySymbols(object).length > 0) {
    return false;
  }

  return Object.getOwnPropertyNames(object).every(
    // @ts-expect-error This is a type guard
    (property) => typeof object[property] === 'string'
  );
}

function callbackRoutes<T extends Router>(router: T, provider: Provider, queries: Queries) {
  router.get('/callback/:connectorId', async (ctx, next) => {
    // If there is an OAuth error, redirect to sign-in.
    const hasOAuthError =
      typeof ctx.query.error === 'string' || typeof ctx.query.error_description === 'string';

    if (hasOAuthError) {
      ctx.redirect(await resolveSessionRedirectUrl(ctx, queries, '/' + experience.routes.signIn));
      return;
    }

    // If there is a code, this is a valid callback and should always continue.
    if (typeof ctx.query.code === 'string') {
      return next();
    }

    // If no code/error, verify interaction session exists.
    try {
      await provider.interactionDetails(ctx.req, ctx.res);
    } catch {
      ctx.redirect(await resolveSessionRedirectUrl(ctx, queries, '/' + experience.routes.signIn));
      return;
    }

    return next();
  });

  router.post('/callback/:connectorId', koaBody(), async (ctx) => {
    const parsed = z.record(z.string()).safeParse(ctx.request.body);

    assertThat(parsed.success, new RequestError('oidc.invalid_request'));

    ctx.status = 303;
    ctx.set('Location', ctx.request.path + '?' + new URLSearchParams(parsed.data).toString());
  });
}

export const mountCallbackRouter = (app: Koa, provider: Provider, queries: Queries) => {
  const router = new Router();
  callbackRoutes(router, provider, queries);

  app.use(router.routes());
};
