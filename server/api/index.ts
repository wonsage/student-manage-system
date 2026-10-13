import "dotenv/config";
import { app } from "../src/app";

// Vercel Serverless Function 入口：/api/* 会被 rewrite 到这里。
export default app;
