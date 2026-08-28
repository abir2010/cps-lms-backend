import type { Core, UID } from "@strapi/strapi";
import { errors } from "@strapi/utils";

const { ForbiddenError, UnauthorizedError, NotFoundError } = errors;

export async function getUserRoleType(
  strapi: Core.Strapi,
  userId: number,
): Promise<string | undefined> {
  const user = await strapi.db
    .query("plugin::users-permissions.user")
    .findOne({ where: { id: userId }, populate: ["role"] });

  return user?.role?.type;
}

function buildPopulate(segments: string[]): unknown {
  if (segments.length === 1) return [segments[0]];
  const [first, ...rest] = segments;
  return { [first]: { populate: buildPopulate(rest) } };
}

function walkPath(entity: Record<string, any>, segments: string[]): any {
  return segments.reduce((node, segment) => node?.[segment], entity);
}

interface OwnerCheckOptions {
  uid: UID.ContentType;
  entityId: string;
  ownerPath: string;
  privilegedTypes: string[];
}

export async function assertOwnerOrPrivileged(
  strapi: Core.Strapi,
  ctx: any,
  { uid, entityId, ownerPath, privilegedTypes }: OwnerCheckOptions,
): Promise<void> {
  const userId = ctx.state.user?.id;
  if (!userId) throw new UnauthorizedError();

  const roleType = await getUserRoleType(strapi, userId);
  if (roleType && privilegedTypes.includes(roleType)) return;

  const segments = ownerPath.split(".");

  const entity = await strapi.documents(uid).findOne({
    documentId: entityId,
    status: "published",
    populate: buildPopulate(segments) as any,
  });

  if (!entity) throw new NotFoundError();

  const owner = walkPath(entity, segments);
  if (owner?.id !== userId) {
    throw new ForbiddenError(
      "You do not have permission to modify this resource.",
    );
  }
}

export async function resolveCourseInstructorId(
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
    const course = await strapi.documents("api::course.course").findOne({
      documentId: asString,
      status: "published",
      populate: ["instructor"],
    });
    instructorId = course?.instructor?.id;
  }

  return instructorId === undefined ? undefined : Number(instructorId);
}
