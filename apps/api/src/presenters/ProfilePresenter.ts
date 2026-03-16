import type { ModelProfile, TacticProfile } from '@acds/core-types';

export class ProfilePresenter {
  static toModelView(profile: ModelProfile) {
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  static toModelViewList(profiles: ModelProfile[]) {
    return profiles.map((profile) => this.toModelView(profile));
  }

  static toTacticView(profile: TacticProfile) {
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  static toTacticViewList(profiles: TacticProfile[]) {
    return profiles.map((profile) => this.toTacticView(profile));
  }
}
