import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tenantsRouter from "./tenants";
import messagesRouter from "./messages";
import reachRouter from "./reach";
import blocksRouter from "./blocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tenantsRouter);
router.use(messagesRouter);
router.use(reachRouter);
router.use(blocksRouter);

export default router;
