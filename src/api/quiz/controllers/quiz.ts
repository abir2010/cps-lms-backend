/**
 * quiz controller
 */

import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import {
  assertOwnerOrPrivileged,
  getUserRoleType,
  resolveCourseInstructorId,
} from "../../../utils/permissions";

const { ForbiddenError } = errors;

const UID = "api::quiz.quiz";
// A quiz question has no owner of its own — ownership is transitive through its course.
const OWNER_PATH = "course.instructor";
const PRIVILEGED = ["admin", "content_manager"];

// network response otherwise.
const CAN_VIEW_ANSWER_KEY = ["admin", "content_manager", "instructor"];

function stripAnswerKey<T extends Record<string, any>>(quiz: T): T {
  const { correct_answer, ...rest } = quiz;
  return rest as T;
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
            "You can only add quizzes to your own courses.",
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

  async find(ctx) {
    const userId = ctx.state.user?.id;
    const roleType = userId ? await getUserRoleType(strapi, userId) : undefined;
    const { data, meta } = await super.find(ctx);

    if (roleType && CAN_VIEW_ANSWER_KEY.includes(roleType)) {
      return { data, meta };
    }
    return {
      data: Array.isArray(data) ? data.map(stripAnswerKey) : data,
      meta,
    };
  },

  async findOne(ctx) {
    const userId = ctx.state.user?.id;
    const roleType = userId ? await getUserRoleType(strapi, userId) : undefined;
    const { data, meta } = await super.findOne(ctx);

    if (roleType && CAN_VIEW_ANSWER_KEY.includes(roleType)) {
      return { data, meta };
    }
    return { data: data ? stripAnswerKey(data) : data, meta };
  },
}));
