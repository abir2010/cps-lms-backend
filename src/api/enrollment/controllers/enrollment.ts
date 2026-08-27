/**
 * enrollment controller
 */

import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import {
  assertOwnerOrPrivileged,
  getUserRoleType,
} from "../../../utils/permissions";

const { ForbiddenError, NotFoundError, UnauthorizedError } = errors;

const UID = "api::enrollment.enrollment";
// Only the enrolled student may edit their own progress; Admin can too.
const PRIVILEGED_UPDATE = ["admin"];
// Admin and Content Manager can see every enrollment; everyone else is scoped.
const UNRESTRICTED_VIEW = ["admin", "content_manager"];

export default factories.createCoreController(UID, ({ strapi }) => ({
  // Enrolling is a Student-only action, and always for yourself.
  async create(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) throw new UnauthorizedError();

    const roleType = await getUserRoleType(strapi, userId);
    if (roleType !== "student") {
      throw new ForbiddenError("Only students can enroll in a course.");
    }

    ctx.request.body.data = { ...ctx.request.body.data, student: userId };
    return super.create(ctx);
  },

  async update(ctx) {
    await assertOwnerOrPrivileged(strapi, ctx, {
      uid: UID,
      entityId: ctx.params.id,
      ownerPath: "student",
      privilegedTypes: PRIVILEGED_UPDATE,
    });
    return super.update(ctx);
  },

  async find(ctx) {
    const userId = ctx.state.user?.id;
    if (userId) {
      const roleType = await getUserRoleType(strapi, userId);
      if (roleType === "student" || roleType === "instructor") {
        const existingFilters = ctx.query.filters || {};
        const scopeFilter =
          roleType === "student"
            ? { student: { id: { $eq: userId } } }
            : { course: { instructor: { id: { $eq: userId } } } };

        ctx.query = {
          ...ctx.query,
          filters: { $and: [existingFilters, scopeFilter] },
        };
      }
    }
    return super.find(ctx);
  },

  async findOne(ctx) {
    const userId = ctx.state.user?.id;
    if (userId) {
      const roleType = await getUserRoleType(strapi, userId);
      if (roleType === "student" || roleType === "instructor") {
        const entity = await strapi.documents(UID).findOne({
          documentId: ctx.params.id,
          populate: { student: true, course: { populate: ["instructor"] } },
        });
        if (!entity) throw new NotFoundError();

        const allowed =
          roleType === "student"
            ? entity.student?.id === userId
            : entity.course?.instructor?.id === userId;

        if (!allowed) throw new ForbiddenError();
      }
    }
    return super.findOne(ctx);
  },
}));
