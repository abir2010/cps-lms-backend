/**
 * blog controller
 */

import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import {
  assertOwnerOrPrivileged,
  getUserRoleType,
} from "../../../utils/permissions";

const { NotFoundError } = errors;

const UID = "api::blog.blog";
const OWNER_PATH = "author";
// Admin has full control over every post; Content Manager only their own.
const PRIVILEGED = ["admin"];
// Roles that may see draft posts in list/detail views at all.
const CAN_VIEW_DRAFTS = ["admin", "content_manager"];

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    const userId = ctx.state.user?.id;
    if (userId) {
      ctx.request.body.data = { ...ctx.request.body.data, author: userId };
    }
    return super.create(ctx);
  },

  async update(ctx) {
    await assertOwnerOrPrivileged(strapi, ctx, {
      uid: UID,
      entityId: ctx.params.id,
      ownerPath: OWNER_PATH,
      privilegedTypes: PRIVILEGED,
    });
    return super.update(ctx);
  },

  async delete(ctx) {
    await assertOwnerOrPrivileged(strapi, ctx, {
      uid: UID,
      entityId: ctx.params.id,
      ownerPath: OWNER_PATH,
      privilegedTypes: PRIVILEGED,
    });
    return super.delete(ctx);
  },

  async find(ctx) {
    const userId = ctx.state.user?.id;
    const roleType = userId ? await getUserRoleType(strapi, userId) : undefined;

    if (!roleType || !CAN_VIEW_DRAFTS.includes(roleType)) {
      const existingFilters = ctx.query.filters || {};
      ctx.query = {
        ...ctx.query,
        filters: { $and: [existingFilters, { status_type: "published" }] },
      };
    }

    return super.find(ctx);
  },

  async findOne(ctx) {
    const userId = ctx.state.user?.id;
    const roleType = userId ? await getUserRoleType(strapi, userId) : undefined;

    if (!roleType || !CAN_VIEW_DRAFTS.includes(roleType)) {
      const entity = await strapi
        .documents(UID)
        .findOne({ documentId: ctx.params.id, fields: ["status_type"] });

      if (entity?.status_type === "draft") {
        throw new NotFoundError("Not found");
      }
    }

    return super.findOne(ctx);
  },
}));
