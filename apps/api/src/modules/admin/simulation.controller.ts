import { Controller, Post, Get, Param, ParseIntPipe, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { SimulationService } from './simulation.service';
import { CreateBotsDto, OpenGameweekDto } from './dto/simulate.dto';

@Controller('admin/simulate')
@Roles(Role.ADMIN)
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Get('status')
  async getStatus() {
    return { data: await this.simulation.getStatus(39) };
  }

  @Post('bots')
  async createBots(@Body() dto: CreateBotsDto) {
    return { data: await this.simulation.createBots(dto) };
  }

  @Post('gw/:gwId/open')
  async openGameweek(
    @Param('gwId', ParseIntPipe) gwId: number,
    @Body() dto: OpenGameweekDto,
  ) {
    return { data: await this.simulation.openGameweek(gwId, dto.minutesFromNow ?? 60) };
  }

  @Post('gw/:gwId/bot-picks')
  async submitBotPicks(@Param('gwId', ParseIntPipe) gwId: number) {
    return { data: await this.simulation.submitBotPicks(gwId) };
  }

  @Post('gw/:gwId/finalize')
  @HttpCode(HttpStatus.OK)
  async finalizeGameweek(@Param('gwId', ParseIntPipe) gwId: number) {
    return { data: await this.simulation.finalizeGameweek(gwId) };
  }
}
