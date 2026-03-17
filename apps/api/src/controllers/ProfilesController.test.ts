import { describe, it, expect } from 'vitest';
import { ProfilesController } from './ProfilesController.js';
import { ProfileCatalogService } from '../services/ProfileCatalogService.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

describe('ProfilesController', () => {
  function makeCatalog() {
    return new ProfileCatalogService([], []);
  }

  describe('model profiles', () => {
    it('listModelProfiles returns empty list initially', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.listModelProfiles({} as any, reply as any);
      expect(reply.body).toEqual([]);
    });

    it('createModelProfile returns 201 with created profile', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.createModelProfile(
        { body: { name: 'test_model', description: 'A test model' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).name).toBe('test_model');
    });

    it('createModelProfile uses default name when name is missing', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.createModelProfile({ body: {} } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).name).toBe('unnamed_model_profile');
    });

    it('getModelProfile returns 404 for unknown id', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.getModelProfile({ params: { id: 'unknown' } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });

    it('getModelProfile returns the profile when found', async () => {
      const catalog = makeCatalog();
      const controller = new ProfilesController(catalog);

      const createReply1 = createReply();
      await controller.createModelProfile(
        { body: { name: 'findme' } } as any,
        createReply1 as any,
      );
      const id = (createReply1.body as any).id;

      const reply = createReply();
      await controller.getModelProfile({ params: { id } } as any, reply as any);
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).name).toBe('findme');
    });

    it('updateModelProfile returns the updated profile', async () => {
      const catalog = makeCatalog();
      const controller = new ProfilesController(catalog);

      const cr = createReply();
      await controller.createModelProfile({ body: { name: 'original' } } as any, cr as any);
      const id = (cr.body as any).id;

      const reply = createReply();
      await controller.updateModelProfile(
        { params: { id }, body: { name: 'updated' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).name).toBe('updated');
    });

    it('updateModelProfile returns 404 for unknown id', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.updateModelProfile(
        { params: { id: 'missing' }, body: { name: 'x' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(404);
    });

    it('deleteModelProfile returns 204 on success', async () => {
      const catalog = makeCatalog();
      const controller = new ProfilesController(catalog);

      const cr = createReply();
      await controller.createModelProfile({ body: { name: 'deleteme' } } as any, cr as any);
      const id = (cr.body as any).id;

      const reply = createReply();
      await controller.deleteModelProfile({ params: { id } } as any, reply as any);
      expect(reply.statusCode).toBe(204);
    });

    it('deleteModelProfile returns 404 for unknown id', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.deleteModelProfile({ params: { id: 'missing' } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });
  });

  describe('tactic profiles', () => {
    it('listTacticProfiles returns empty list initially', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.listTacticProfiles({} as any, reply as any);
      expect(reply.body).toEqual([]);
    });

    it('createTacticProfile returns 400 when executionMethod is missing', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.createTacticProfile({ body: { name: 'test' } } as any, reply as any);
      expect(reply.statusCode).toBe(400);
      expect((reply.body as any).message).toContain('executionMethod');
    });

    it('createTacticProfile returns 201 with created tactic', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.createTacticProfile(
        { body: { name: 'test_tactic', executionMethod: 'single_pass' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).executionMethod).toBe('single_pass');
    });

    it('createTacticProfile uses default name when missing', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.createTacticProfile(
        { body: { executionMethod: 'chain' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).name).toBe('unnamed_tactic_profile');
    });

    it('getTacticProfile returns 404 for unknown id', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.getTacticProfile({ params: { id: 'unknown' } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });

    it('getTacticProfile returns profile when found', async () => {
      const catalog = makeCatalog();
      const controller = new ProfilesController(catalog);

      const cr = createReply();
      await controller.createTacticProfile(
        { body: { name: 'findtactic', executionMethod: 'chain' } } as any,
        cr as any,
      );
      const id = (cr.body as any).id;

      const reply = createReply();
      await controller.getTacticProfile({ params: { id } } as any, reply as any);
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).name).toBe('findtactic');
    });

    it('deleteTacticProfile returns 204 on success', async () => {
      const catalog = makeCatalog();
      const controller = new ProfilesController(catalog);

      const cr = createReply();
      await controller.createTacticProfile(
        { body: { name: 'del', executionMethod: 'x' } } as any,
        cr as any,
      );
      const id = (cr.body as any).id;

      const reply = createReply();
      await controller.deleteTacticProfile({ params: { id } } as any, reply as any);
      expect(reply.statusCode).toBe(204);
    });

    it('deleteTacticProfile returns 404 for unknown id', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.deleteTacticProfile({ params: { id: 'missing' } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });

    it('updateTacticProfile returns the updated tactic', async () => {
      const catalog = makeCatalog();
      const controller = new ProfilesController(catalog);

      const cr = createReply();
      await controller.createTacticProfile(
        { body: { name: 'orig', executionMethod: 'chain' } } as any,
        cr as any,
      );
      const id = (cr.body as any).id;

      const reply = createReply();
      await controller.updateTacticProfile(
        { params: { id }, body: { name: 'updated_tactic' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).name).toBe('updated_tactic');
    });

    it('updateTacticProfile returns 404 for unknown id', async () => {
      const controller = new ProfilesController(makeCatalog());
      const reply = createReply();
      await controller.updateTacticProfile(
        { params: { id: 'miss' }, body: { name: 'x' } } as any,
        reply as any,
      );
      expect(reply.statusCode).toBe(404);
    });
  });
});
