/**
 * lesson controller
 */

import type { Core } from "@strapi/strapi";
import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import {
  assertOwnerOrPrivileged,
  getUserRoleType,
} from "../../../utils/permissions";

const { ForbiddenError } = errors;

const UID = "api::lesson.lesson";
// A lesson has no owner of its own — ownership is transitive through its course.
const OWNER_PATH = "course.instructor";
const PRIVILEGED = ["admin", "content_manager"];

/** Course relation values come in as either a numeric id or a documentId. */
async function resolveCourseInstructorId(
  strapi: Core.Strapi,
  courseRef: unknown,
): Promise<number | undefined> {
  const asString = String(courseRef);
  let instructorId: unknown;

  if (/^\d+$/.test(asString)) {
    const course = await strapi.db
      .query("api::course.course")
      .findOne({ where: { id: asString }, populate: ["instructor"] });
    instructorId = course?.instructor?.id;
  } else {
    const course = await strapi
      .documents("api::course.course")
      .findOne({ documentId: asString, populate: ["instructor"] });
    instructorId = course?.instructor?.id;
  }

  return instructorId === undefined ? undefined : Number(instructorId);
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    const userId = ctx.state.user?.id;
    const courseRef = ctx.request.body?.data?.course;

    if (userId && courseRef) {
      const roleType = await getUserRoleType(strapi, userId);
      if (roleType === "instructor") {
        const instructorId = await resolveCourseInstructorId(strapi, courseRef);
        if (instructorId !== userId) {
          throw new ForbiddenError(
            "You can only add lessons to your own courses.",
          );
        }
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
