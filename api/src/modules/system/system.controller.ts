import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';

@ApiTags('System')
@Controller()
export class SystemController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'chieng-khuong-smart-gate-api',
      gateName: 'Cửa khẩu Chiềng Khương',
      province: 'Sơn La',
      timestamp: new Date().toISOString(),
    };
  }
}
