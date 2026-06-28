import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import messagesRouter from "./messages";
import reachRouter from "./reach";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(messagesRouter);
router.use(reachRouter);
router.use(storageRouter);

export default router;
