import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      this.logger.error('RolesGuard: user is absent on a role-protected route — possible guard ordering issue');
      return false;
    }

    const allowed = requiredRoles.some((role) => user.role === role);
    if (!allowed) {
      this.logger.warn(`Access denied: userId=${user.id} role=${user.role} required=[${requiredRoles}]`);
    }
    return allowed;
  }
}
