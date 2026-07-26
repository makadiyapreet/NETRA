import { Router, Request, Response } from 'express';
import { extractRole } from '../auth/rbac';

const router = Router();
router.use(extractRole);

/**
 * GET /api/posts
 * Filterable, paginated post feed.
 * Query params: language, geo_location, keyword, threat_category, page, size
 */
router.get('/', (req: Request, res: Response) => {
  const dataStore = req.app.locals.dataStore;
  const { language, geo_location, keyword, threat_category, platform, page, size } = req.query;

  const result = dataStore.getPosts({
    language: language as string,
    geo_location: geo_location as string,
    keyword: keyword as string,
    threat_category: threat_category as string,
    platform: platform as string,
    page: page ? parseInt(page as string) : undefined,
    size: size ? parseInt(size as string) : undefined,
  });

  res.json(result);
});

export default router;
