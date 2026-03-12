import { Body, Controller, Get, Post, Query, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  execute(@CurrentUser('id') userId: string, @Body() dto: CreateTransferDto) {
    return this.transfersService.executeTransfer(userId, dto);
  }

  @Get()
  findAll(
    @Query('fantasyTeamId', ParseUUIDPipe) fantasyTeamId: string,
    @Query('gameweekId', ParseIntPipe) gameweekId: number,
  ) {
    return this.transfersService.findTransfers(fantasyTeamId, gameweekId);
  }
}
