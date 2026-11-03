/**
 * GraphQL client for storefront
 * Uses dynamic endpoint resolution like the dashboard
 */

import { GraphQLClient, RequestDocument, Variables } from 'graphql-request';
import { getGraphQLEndpoint } from './getBaseUrl';
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl';

class OpenfrontClient {
  // Built PER REQUEST: the loopback fetch signs the CURRENT visitor's identity, so nothing about one
  // visitor (endpoint, identity or headers) may be cached on this instance.
  private async getClient(): Promise<GraphQLClient> {
    // An explicit NEXT_PUBLIC_BACKEND_URL points at another backend: keep that exactly as before.
    const target = process.env.NEXT_PUBLIC_BACKEND_URL
      ? { endpoint: await getGraphQLEndpoint(), fetch: undefined }
      : await getServerGraphQLTarget();
    return new GraphQLClient(target.endpoint, {
      credentials: 'include',
      headers: {
        'Connection': 'keep-alive',
      },
      timeout: 10000,
      ...(target.fetch ? { fetch: target.fetch } : {}),
    });
  }

  async request<T = any, V extends Variables = Variables>(
    document: RequestDocument,
    variables?: V,
    requestHeaders?: HeadersInit
  ): Promise<T> {
    const client = await this.getClient();
    return await client.request(document, variables, requestHeaders);
  }
}

export const openfrontClient = new OpenfrontClient();
