import { Module } from '@nestjs/common';
import { EmployeeSnapshotService } from './employee-snapshot.service';

@Module({
  providers: [EmployeeSnapshotService],
  exports: [EmployeeSnapshotService],
})
export class EmployeeSnapshotModule {}
