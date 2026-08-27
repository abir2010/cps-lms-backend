/**
 * course controller
 */

import { factories } from "@strapi/strapi";
import {
  assertOwnerOrPrivileged,
  getUserRoleType,
} from "../../../utils/permissions";

const UID = "api::course.course";
const OWNER_PATH = "instructor";
// Admin and Content Manager can touch any course; Instructor only their own.
const PRIVILEGED = ["admin", "content_manager"];

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    const userId = ctx.state.user?.id;
    if (userId) {
      const roleType = await getUserRoleType(strapi, userId);
      if (roleType === "instructor") {
        ctx.request.body.data = {
          ...ctx.request.body.data,
          instructor: userId,
        };
      }
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
}));
