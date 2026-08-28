/**
 * quiz-result controller
 */

import { factories } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { getUserRoleType } from "../../../utils/permissions";

const { ForbiddenError, UnauthorizedError, NotFoundError, ValidationError } =
  errors;

const UID = "api::quiz-result.quiz-result";

/** Quiz relation values come in as either a numeric id or a documentId. */
async function resolveQuiz(strapi: any, quizRef: unknown) {
  const asString = String(quizRef);
  if (/^\d+$/.test(asString)) {
    return strapi.db.query("api::quiz.quiz").findOne({
      where: { id: asString },
      populate: { course: { populate: ["instructor"] } },
    });
  }

  return strapi.documents("api::quiz.quiz").findOne({
    documentId: asString,
    status: "published",
    populate: { course: { populate: ["instructor"] } },
  });
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) throw new UnauthorizedError();

    const roleType = await getUserRoleType(strapi, userId);
    if (roleType !== "student") {
      throw new ForbiddenError("Only students can submit quiz answers.");
    }

    const { quiz: quizRef, selected_answer: selectedAnswer } =
      ctx.request.body?.data ?? {};
    if (!quizRef || !selectedAnswer) {
      throw new ValidationError(
        "A quiz question and a selected answer are required.",
      );
    }

    const quiz = await resolveQuiz(strapi, quizRef);
    if (!quiz) throw new NotFoundError("Quiz question not found.");

    const existing = await strapi.db.query(UID).findOne({
      where: { student: userId, quiz: quiz.id },
    });
    if (existing) {
      throw new ForbiddenError("You have already answered this question.");
    }

    ctx.request.body.data = {
      quiz: quizRef,
      selected_answer: selectedAnswer,
      student: userId,
      score: selectedAnswer === quiz.correct_answer ? 1 : 0,
    };

    return super.create(ctx);
  },

  // Once graded, a result is locked — nobody (not even the student who
  // owns it) can edit `score`/`selected_answer` after the fact. Without
  // this, the Student role's default `update` grant would let a student
  // simply PUT their own result and rewrite a wrong answer into a correct
  // one, bypassing auto-grading entirely.
  async update(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) throw new UnauthorizedError();

    const roleType = await getUserRoleType(strapi, userId);
    if (roleType !== "admin") {
      throw new ForbiddenError(
        "Quiz results cannot be edited after submission.",
      );
    }

    return super.update(ctx);
  },

  // Scope list results server-side: a Student only ever sees their own
  // answers, an Instructor only sees results for quizzes in courses they
  // teach.
  async find(ctx) {
    const userId = ctx.state.user?.id;
    if (userId) {
      const roleType = await getUserRoleType(strapi, userId);
      if (roleType === "student" || roleType === "instructor") {
        const existingFilters = ctx.query.filters || {};
        const scopeFilter =
          roleType === "student"
            ? { student: { id: { $eq: userId } } }
            : { quiz: { course: { instructor: { id: { $eq: userId } } } } };

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
          status: "published",
          populate: {
            student: true,
            quiz: { populate: { course: { populate: ["instructor"] } } },
          },
        });
        if (!entity) throw new NotFoundError();

        const allowed =
          roleType === "student"
            ? entity.student?.id === userId
            : entity.quiz?.course?.instructor?.id === userId;

        if (!allowed) throw new ForbiddenError();
      }
    }
    return super.findOne(ctx);
  },
}));
