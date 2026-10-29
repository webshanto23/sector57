import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should report ok when the database answers', async () => {
      await expect(appController.health()).resolves.toEqual({ ok: true });
    });
  });

  describe('society', () => {
    it('returns the request society', () => {
      const society = { id: 'x', slug: 's', nameBn: 'স', nameEn: null, fiscalYearStartMonth: 7, requireIdNumbers: false, mark: 'স', placeBn: null, placeEn: null };
      expect(appController.society(society)).toBe(society);
    });
  });
});
