import {
  Controller, Get, Post, Delete, Body, Param, UseGuards, Req,
  UseInterceptors, UploadedFile, Query, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { Express } from 'express';

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private service: ContactsService) {}

  @Post('lists')
  @ApiOperation({ summary: 'Create a contact list' })
  createList(@Req() req, @Body() body: { name: string; description?: string }) {
    return this.service.createList(req.user.id, body.name, body.description);
  }

  @Get('lists')
  @ApiOperation({ summary: 'Get all contact lists' })
  getLists(@Req() req) {
    return this.service.getLists(req.user.id);
  }

  @Delete('lists/:listId')
  @ApiOperation({ summary: 'Delete a contact list' })
  deleteList(@Req() req, @Param('listId') listId: string) {
    return this.service.deleteList(req.user.id, listId);
  }

  @Post('lists/:listId/import')
  @ApiOperation({ summary: 'Import contacts from CSV' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importContacts(
    @Req() req,
    @Param('listId') listId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.importContacts(req.user.id, listId, file.buffer, file.originalname);
  }

  @Get('lists/:listId/contacts')
  @ApiOperation({ summary: 'Get contacts in a list' })
  getContacts(
    @Req() req,
    @Param('listId') listId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('search') search?: string,
  ) {
    return this.service.getContacts(req.user.id, listId, +page, +limit, search);
  }

  @Post('opt-out')
  @ApiOperation({ summary: 'Opt out a phone number' })
  optOut(@Body() body: { phone: string }) {
    return this.service.optOut(body.phone);
  }
}
