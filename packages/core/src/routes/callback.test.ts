import Koa from 'koa';
import supertest from 'supertest';
import type { Provider } from 'oidc-provider';
import { GoogleConnector } from '@logto/connector-kit';

import { mountCallbackRouter } from './callback.js';
import type Queries from '../tenants/Queries.js';

const { jest } = import.meta;

describe('callback routes', () => {
  const app = new Koa();
  const interactionDetails = jest.fn().mockResolvedValue({});
  const findDefaultSignInExperience = jest
    .fn()
    .mockResolvedValue({ unknownSessionRedirectUrl: 'https://custom.example/sign-in' });
  const getRowsByKeys = jest.fn().mockResolvedValue({ rows: [] });

  mountCallbackRouter(
    app,
    { interactionDetails } as unknown as Provider,
    {
      signInExperiences: { findDefaultSignInExperience },
      logtoConfigs: { getRowsByKeys },
    } as unknown as Queries
  );
  const request = supertest(app.callback());

  beforeEach(() => {
    jest.clearAllMocks();
    interactionDetails.mockResolvedValue({});
  });

  it('should redirect to the same path with query string', async () => {
    const response = await request.post('/callback/some_connector_id').send({ some: 'data' });

    expect(response.status).toBe(303);
    expect(response.header.location).toBe('/callback/some_connector_id?some=data');
  });

  it('should redirect to sign-in fallback when oauth callback contains error', async () => {
    const response = await request.get(
      '/callback/github?error=access_denied&error_description=user_denied'
    );

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('https://custom.example/sign-in');
  });

  it('should redirect to sign-in fallback when interaction session is missing', async () => {
    interactionDetails.mockRejectedValueOnce(new Error('session not found'));

    const response = await request.get('/callback/github?code=mock_code&state=mock_state');

    expect(response.status).toBe(302);
    expect(response.header.location).toBe('https://custom.example/sign-in');
  });

  it('should keep app_id when redirecting to tenant sign-in fallback', async () => {
    findDefaultSignInExperience.mockResolvedValueOnce({ unknownSessionRedirectUrl: null });
    interactionDetails.mockResolvedValueOnce({
      params: {
        client_id: 'gymkabj3a7pyg9b7c6tuw',
      },
    });

    const response = await request.get('/callback/github?error=access_denied');

    expect(response.status).toBe(302);
    const redirectUrl = new URL(response.header.location);
    expect(redirectUrl.pathname).toBe('/sign-in');
    expect(redirectUrl.searchParams.get('app_id')).toBe('gymkabj3a7pyg9b7c6tuw');
  });

  it('should bypass session check for google one tap callback', async () => {
    const response = await request.get(
      `/callback/google?${GoogleConnector.oneTapParams.credential}=mock_credential`
    );

    expect(response.status).toBe(404);
    expect(interactionDetails).not.toBeCalled();
  });
});
