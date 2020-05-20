import { GraphQLError } from 'graphql';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ServerResponse } from 'http';
import { generateTraceContext } from '@google-cloud/trace-agent/build/src/util';
import { Constants } from '@google-cloud/trace-agent/build/src/constants';

export interface GraphqlPayload {
  query: string;
  operationName?: string;
  variables?: object;
}

export const postFields = (userId?: string): string => {
  const base =
    'id,title,url,publishedAt,createdAt,image,ratio,placeholder,readTime,publication { id, name, image },tags';
  if (userId) {
    return `${base},bookmarked,read`;
  }
  return base;
};

export const injectGraphql = async (
  fastify: FastifyInstance,
  payload: GraphqlPayload,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractResponse: (obj: object) => any,
  req: FastifyRequest,
  res: FastifyReply<ServerResponse>,
): Promise<FastifyReply<ServerResponse>> => {
  const traceContext = generateTraceContext(req.span.getTraceContext());
  const reqHeaders = {
    ...req.headers,
    [Constants.TRACE_CONTEXT_HEADER_NAME]: traceContext,
  };
  delete reqHeaders['content-length'];
  const graphqlRes = await fastify.inject({
    method: 'POST',
    url: '/graphql',
    headers: reqHeaders,
    payload,
  });

  if (graphqlRes.statusCode !== 200) {
    return res.status(graphqlRes.statusCode).send(graphqlRes.rawPayload);
  }

  const json = graphqlRes.json();
  const errors = json['errors'] as GraphQLError[];
  const code = errors?.[0]?.extensions?.code;
  if (code === 'UNAUTHENTICATED') {
    return res.status(401).send();
  } else if (
    code === 'VALIDATION_ERROR' ||
    code === 'GRAPHQL_VALIDATION_FAILED'
  ) {
    return res.status(400).send();
  } else if (code === 'NOT_FOUND') {
    return res.status(404).send();
  } else if (code) {
    return res.status(500).send();
  }

  const resBody = extractResponse(json);
  return res.status(resBody ? 200 : 204).send(resBody);
};