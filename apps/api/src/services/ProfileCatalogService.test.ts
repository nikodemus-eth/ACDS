import { describe, it, expect } from 'vitest';
import { ProfileCatalogService } from './ProfileCatalogService.js';

describe('ProfileCatalogService', () => {
  describe('model profiles', () => {
    it('listModelProfiles returns a copy of the list', async () => {
      const service = new ProfileCatalogService([], []);
      const list = await service.listModelProfiles();
      expect(list).toEqual([]);
    });

    it('createModelProfile adds a profile with defaults', async () => {
      const service = new ProfileCatalogService([], []);
      const profile = await service.createModelProfile({ name: 'test' });

      expect(profile.name).toBe('test');
      expect(profile.id).toBeDefined();
      expect(profile.vendor).toBe('openai'); // cloudAllowed default
      expect(profile.enabled).toBe(true);
      expect(profile.supportedTaskTypes).toEqual([]);
      expect(profile.description).toBe('test profile');
    });

    it('createModelProfile uses trimmed description', async () => {
      const service = new ProfileCatalogService([], []);
      const profile = await service.createModelProfile({
        name: 'test',
        description: '  custom description  ',
      });
      expect(profile.description).toBe('custom description');
    });

    it('createModelProfile with localOnly sets vendor to ollama', async () => {
      const service = new ProfileCatalogService([], []);
      const profile = await service.createModelProfile({
        name: 'local',
        localOnly: true,
      });
      expect(profile.vendor).toBe('ollama');
      expect(profile.localOnly).toBe(true);
    });

    it('getModelProfile returns null for missing id', async () => {
      const service = new ProfileCatalogService([], []);
      const result = await service.getModelProfile('missing');
      expect(result).toBeNull();
    });

    it('getModelProfile returns profile by id', async () => {
      const service = new ProfileCatalogService([], []);
      const created = await service.createModelProfile({ name: 'findme' });
      const found = await service.getModelProfile(created.id);
      expect(found?.name).toBe('findme');
    });

    it('deleteModelProfile removes existing profile', async () => {
      const service = new ProfileCatalogService([], []);
      const created = await service.createModelProfile({ name: 'deleteme' });
      const deleted = await service.deleteModelProfile(created.id);
      expect(deleted).toBe(true);

      const list = await service.listModelProfiles();
      expect(list).toHaveLength(0);
    });

    it('deleteModelProfile returns false for missing id', async () => {
      const service = new ProfileCatalogService([], []);
      const deleted = await service.deleteModelProfile('missing');
      expect(deleted).toBe(false);
    });

    it('updateModelProfile updates specific fields', async () => {
      const service = new ProfileCatalogService([], []);
      const created = await service.createModelProfile({ name: 'original' });
      const updated = await service.updateModelProfile(created.id, { name: 'updated' });

      expect(updated?.name).toBe('updated');
      expect(updated?.description).toBe(created.description);
    });

    it('updateModelProfile returns null for missing id', async () => {
      const service = new ProfileCatalogService([], []);
      const result = await service.updateModelProfile('missing', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('tactic profiles', () => {
    it('listTacticProfiles returns a copy of the list', async () => {
      const service = new ProfileCatalogService([], []);
      const list = await service.listTacticProfiles();
      expect(list).toEqual([]);
    });

    it('createTacticProfile adds a tactic with defaults', async () => {
      const service = new ProfileCatalogService([], []);
      const tactic = await service.createTacticProfile({
        name: 'test_tactic',
        executionMethod: 'single_pass',
      });

      expect(tactic.name).toBe('test_tactic');
      expect(tactic.executionMethod).toBe('single_pass');
      expect(tactic.enabled).toBe(true);
      expect(tactic.multiStage).toBe(false);
      expect(tactic.description).toBe('test_tactic tactic');
    });

    it('createTacticProfile uses trimmed description', async () => {
      const service = new ProfileCatalogService([], []);
      const tactic = await service.createTacticProfile({
        name: 'test',
        executionMethod: 'chain',
        description: '  my desc  ',
      });
      expect(tactic.description).toBe('my desc');
    });

    it('getTacticProfile returns null for missing id', async () => {
      const service = new ProfileCatalogService([], []);
      const result = await service.getTacticProfile('missing');
      expect(result).toBeNull();
    });

    it('getTacticProfile returns tactic by id', async () => {
      const service = new ProfileCatalogService([], []);
      const created = await service.createTacticProfile({
        name: 'findtactic',
        executionMethod: 'chain',
      });
      const found = await service.getTacticProfile(created.id);
      expect(found?.name).toBe('findtactic');
    });

    it('deleteTacticProfile removes existing tactic', async () => {
      const service = new ProfileCatalogService([], []);
      const created = await service.createTacticProfile({
        name: 'del',
        executionMethod: 'x',
      });
      expect(await service.deleteTacticProfile(created.id)).toBe(true);
      expect(await service.listTacticProfiles()).toHaveLength(0);
    });

    it('deleteTacticProfile returns false for missing id', async () => {
      const service = new ProfileCatalogService([], []);
      expect(await service.deleteTacticProfile('missing')).toBe(false);
    });

    it('updateTacticProfile updates specific fields', async () => {
      const service = new ProfileCatalogService([], []);
      const created = await service.createTacticProfile({
        name: 'orig',
        executionMethod: 'chain',
      });
      const updated = await service.updateTacticProfile(created.id, { name: 'updated' });
      expect(updated?.name).toBe('updated');
      expect(updated?.executionMethod).toBe('chain');
    });

    it('updateTacticProfile returns null for missing id', async () => {
      const service = new ProfileCatalogService([], []);
      expect(await service.updateTacticProfile('missing', { name: 'x' })).toBeNull();
    });
  });
});
