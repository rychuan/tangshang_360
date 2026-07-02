import { Module } from '@nestjs/common';
import { SystemDictController } from './system-dict.controller';
import { SystemDictService } from './system-dict.service';

@Module({
  controllers: [SystemDictController],
  providers: [SystemDictService],
  exports: [SystemDictService],
})
export class SystemDictModule {}
