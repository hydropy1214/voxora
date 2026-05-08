import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AudioFilesController } from './audio-files.controller';
import { AudioFilesService } from './audio-files.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowed = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp3'];
        if (allowed.includes(file.mimetype) ||
            file.originalname.match(/\.(mp3|wav)$/i)) {
          cb(null, true);
        } else {
          cb(new Error('Only MP3 and WAV files are allowed'), false);
        }
      },
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  ],
  controllers: [AudioFilesController],
  providers: [AudioFilesService],
  exports: [AudioFilesService],
})
export class AudioFilesModule {}
