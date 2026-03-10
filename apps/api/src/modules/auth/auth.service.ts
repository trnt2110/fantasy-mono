import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Fast-path UX check (race condition handled below via P2002 catch)
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email already in use' : 'Username already taken',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, username: dto.username, passwordHash },
      });
      return this.issueTokens(user.id, user.email, user.role);
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email or username already in use');
      }
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(token: string) {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({ where: { token } });

      if (!stored) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (stored.revoked) {
        // Reuse of a revoked token signals possible theft — invalidate all sessions
        this.logger.warn(`Refresh token reuse detected for userId=${stored.userId}. Revoking all sessions.`);
        await tx.refreshToken.updateMany({
          where: { userId: stored.userId },
          data: { revoked: true },
        });
        throw new UnauthorizedException('Session invalidated due to suspicious activity. Please log in again.');
      }

      if (stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      await tx.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

      const user = await tx.user.findUnique({
        where: { id: stored.userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) throw new UnauthorizedException('User account not found');

      const refreshToken = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await tx.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });

      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
      const accessToken = this.jwtService.sign(payload);

      return { accessToken, refreshToken };
    });
  }

  async logout(token: string, userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token, userId, revoked: false },
      data: { revoked: true },
    });
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
