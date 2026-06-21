import { Module } from '@nestjs/common';
import { TeamStructureController } from './team-structure.controller';
import { TeamStructureService } from './team-structure.service';

@Module({
  controllers: [TeamStructureController],
  providers: [TeamStructureService],
  exports: [TeamStructureService],
})
export class TeamStructureModule {}