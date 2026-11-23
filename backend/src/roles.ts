import type {RequestHandler} from 'express';
import type {User} from './domain/types.js';
import {HttpError} from './errors.js';
export const isResolver=(u?:Pick<User,'roles'>)=>!!u?.roles.some(r=>['resolver','dispute_resolver'].includes(r));
export const isStaff=(u?:Pick<User,'roles'>)=>!!u&&(u.roles.includes('admin')||isResolver(u));
export const marketplaceOnly:RequestHandler=(req,_res,next)=>isStaff(req.user)?next(new HttpError(403,'staff_marketplace_forbidden')):next();
export const resolverOnly:RequestHandler=(req,_res,next)=>isResolver(req.user)?next():next(new HttpError(403,'not_allowed'));
