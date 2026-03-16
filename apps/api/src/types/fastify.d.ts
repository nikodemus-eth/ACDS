import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    diContainer?: {
      resolve<T>(name: string): T;
      [key: string]: any;
    };
    config: import('../config/appConfig').AppConfig;
  }
}
