import { Module } from '@nestjs/common';
import { BitableSyncController } from './bitable-sync.controller';
import { BitableSyncService } from './bitable-sync.service';

@Module({
  controllers: [BitableSyncController],
  providers: [BitableSyncService],
})
export class BitableSyncModule {}
