const _ = require('lodash');

module.exports = async (ctx, next) => {
  let role;

  if (ctx.request && ctx.request.header && ctx.request.header.authorization) {
    try {
      const { _id, id } = await strapi.plugins['users-permissions'].services.jwt.getToken(ctx);

      if ((id || _id) === undefined) {
        throw new Error('Invalid token: Token did not contain required fields');
      }

      ctx.state.user = await strapi.query('user', 'users-permissions').findOne({ _id, id });
    } catch (err) {
      return ctx.unauthorized(err);
    }

    if (!ctx.state.user) {
      return ctx.unauthorized(`User Not Found.`);
    }

    role = ctx.state.user.role;

    if (role.type === 'root') {
      return await next();
    }

    const store = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions'
    });

    if (_.get(await store.get({key: 'advanced'}), 'email_confirmation') && ctx.state.user.confirmed !== true) {
      return ctx.unauthorized('Your account email is not confirmed.');
    }
    
    if (ctx.state.user.blocked === true) {
      return ctx.unauthorized(`Your account has been blocked by the administrator.`);
    }
  }
  // Retrieve `public` role.
  if (!role) {
    role = await strapi.query('role', 'users-permissions').findOne({ type: 'public' }, []);
  }

  const route = ctx.request.route;
  const permission = await strapi.query('permission', 'users-permissions').findOne({
    role: role._id || role.id,
    type: route.plugin || 'application',
    controller: route.controller,
    action: route.action,
    enabled: true
  }, []);

  if (!permission) {
    if (ctx.request.graphql === null) {
      return ctx.request.graphql = strapi.errors.forbidden();
    }

    return ctx.forbidden();
  }

  // Execute the policies.
  if (permission.policy) {
    return await strapi.plugins['users-permissions'].config.policies[permission.policy](ctx, next);
  }

  // Execute the action.
  await next();
};
