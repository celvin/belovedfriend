import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import tenantsRouter from "./tenants";
import messagesRouter from "./messages";
import reachRouter from "./reach";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(tenantsRouter);
router.use(messagesRouter);
router.use(reachRouter);

export default router;
