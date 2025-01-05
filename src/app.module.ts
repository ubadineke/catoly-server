import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { GeckoModule } from './gecko/gecko.module';
import { DasModule } from './das/das.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    GeckoModule,
    DasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}