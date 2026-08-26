import type { Core } from "@strapi/strapi";

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // The frontend reads each user's role via `GET /api/users/me?populate=role`
    // to display their role badge and route them (student/instructor/admin
    // areas). Strapi's content API only populates a relation for a role that
    // itself holds `find`/`findOne` on the relation's target content type —
    // here `plugin::users-permissions.role`. Only the seeded "Admin" role had
    // that permission, so every other role's own role was silently dropped
    // from the response, and role changes never took effect on next login.
    // Grant read-only access to the role list/detail to every role that can
    // authenticate, so `populate=role` works for everyone.
    const rolesNeedingRoleVisibility = [
      "authenticated",
      "student",
      "instructor",
      "content_manager",
    ];
    const actionsToGrant = [
      "plugin::users-permissions.role.find",
      "plugin::users-permissions.role.findOne",
    ];

    const roles = await strapi.db
      .query("plugin::users-permissions.role")
      .findMany({
        where: { type: { $in: rolesNeedingRoleVisibility } },
      });

    for (const role of roles) {
      for (const action of actionsToGrant) {
        const existing = await strapi.db
          .query("plugin::users-permissions.permission")
          .findOne({
            where: { action, role: role.id },
          });
        if (!existing) {
          await strapi.db.query("plugin::users-permissions.permission").create({
            data: { action, role: role.id },
          });
        }
      }
    }

    // New public sign-ups (`POST /api/auth/local/register`) get assigned
    // whichever role's `type` matches the plugin's "default role for
    // authenticated users" setting. That setting was left at Strapi's
    // built-in "authenticated", so every new user landed on the generic
    // Authenticated role instead of the app's custom "Student" role. Point
    // it at Student instead.
    const studentRole = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({
        where: { type: "student" },
      });

    if (studentRole) {
      const pluginStore = strapi.store({
        type: "plugin",
        name: "users-permissions",
      });
      const advanced = (await pluginStore.get({ key: "advanced" })) as Record<
        string,
        unknown
      >;

      if (advanced && advanced.default_role !== studentRole.type) {
        await pluginStore.set({
          key: "advanced",
          value: { ...advanced, default_role: studentRole.type },
        });
      }
    }
  },
};
