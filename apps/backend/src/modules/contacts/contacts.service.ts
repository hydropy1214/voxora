import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parse as csvParse } from 'csv-parse/sync';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async createList(userId: string, name: string, description?: string) {
    return this.prisma.contactList.create({
      data: { userId, name, description },
    });
  }

  async getLists(userId: string) {
    return this.prisma.contactList.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getList(userId: string, listId: string) {
    const list = await this.prisma.contactList.findFirst({ where: { id: listId, userId } });
    if (!list) throw new NotFoundException('Contact list not found');
    return list;
  }

  async deleteList(userId: string, listId: string) {
    await this.getList(userId, listId);
    await this.prisma.contactList.delete({ where: { id: listId } });
    return { success: true };
  }

  async importContacts(userId: string, listId: string, fileBuffer: Buffer, filename: string) {
    await this.getList(userId, listId);

    let records: any[];
    try {
      records = csvParse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (e) {
      throw new BadRequestException('Invalid CSV format');
    }

    const phoneField = this.detectPhoneColumn(records[0] ? Object.keys(records[0]) : []);
    if (!phoneField) throw new BadRequestException('No phone number column detected');

    const contacts = [];
    const seenPhones = new Set<string>();

    for (const record of records) {
      const rawPhone = record[phoneField]?.toString().trim();
      if (!rawPhone) continue;

      let formattedPhone = rawPhone;
      let isValid = false;
      let countryCode: string | undefined;

      try {
        if (isValidPhoneNumber(rawPhone, 'US')) {
          const parsed = parsePhoneNumber(rawPhone, 'US');
          formattedPhone = parsed.format('E.164');
          countryCode = parsed.country;
          isValid = true;
        } else if (rawPhone.startsWith('+') && isValidPhoneNumber(rawPhone)) {
          const parsed = parsePhoneNumber(rawPhone);
          formattedPhone = parsed.format('E.164');
          countryCode = parsed.country;
          isValid = true;
        }
      } catch {}

      const isDuplicate = seenPhones.has(formattedPhone);
      seenPhones.add(formattedPhone);

      contacts.push({
        listId,
        phone: rawPhone,
        formattedPhone,
        firstName: record.first_name || record.firstName || record.firstname,
        lastName: record.last_name || record.lastName || record.lastname,
        email: record.email,
        company: record.company,
        isValid,
        isDuplicate,
        countryCode,
        customFields: this.extractCustomFields(record, [phoneField, 'first_name', 'last_name', 'firstName', 'lastName', 'email', 'company']),
      });
    }

    // Batch insert
    const BATCH_SIZE = 1000;
    let inserted = 0;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      await this.prisma.contact.createMany({ data: batch, skipDuplicates: false });
      inserted += batch.length;
    }

    const validCount = contacts.filter(c => c.isValid && !c.isDuplicate).length;
    await this.prisma.contactList.update({
      where: { id: listId },
      data: { totalCount: contacts.length, validCount },
    });

    return { total: contacts.length, valid: validCount, duplicates: contacts.filter(c => c.isDuplicate).length };
  }

  async getContacts(userId: string, listId: string, page = 1, limit = 50, search?: string) {
    await this.getList(userId, listId);

    const where: any = { listId };
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async addSingleContact(
    userId: string,
    listId: string,
    data: { phone: string; firstName?: string; lastName?: string; email?: string; notes?: string; address?: string },
  ) {
    await this.getList(userId, listId);
    const raw = data.phone.trim();
    let formattedPhone = raw;
    let isValid = false;
    let countryCode: string | undefined;
    try {
      if (isValidPhoneNumber(raw, 'US')) {
        const parsed = parsePhoneNumber(raw, 'US');
        formattedPhone = parsed.format('E.164');
        countryCode = parsed.country;
        isValid = true;
      } else if (raw.startsWith('+') && isValidPhoneNumber(raw)) {
        const parsed = parsePhoneNumber(raw);
        formattedPhone = parsed.format('E.164');
        countryCode = parsed.country;
        isValid = true;
      }
    } catch {}

    const contact = await this.prisma.contact.create({
      data: {
        listId,
        phone: raw,
        formattedPhone,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: data.email || null,
        isValid,
        countryCode,
        customFields: data.notes || data.address
          ? { notes: data.notes, address: data.address }
          : undefined,
      },
    });

    await this.prisma.contactList.update({
      where: { id: listId },
      data: { totalCount: { increment: 1 }, validCount: isValid ? { increment: 1 } : undefined },
    });

    return contact;
  }

  async removeContact(userId: string, listId: string, contactId: string) {
    await this.getList(userId, listId);
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, listId } });
    if (!contact) throw new NotFoundException('Contact not found');
    await this.prisma.contact.delete({ where: { id: contactId } });
    await this.prisma.contactList.update({
      where: { id: listId },
      data: {
        totalCount: { decrement: 1 },
        validCount: contact.isValid ? { decrement: 1 } : undefined,
      },
    });
    return { success: true };
  }

  async optOut(phone: string) {
    await this.prisma.contact.updateMany({
      where: { formattedPhone: phone },
      data: { isOptedOut: true },
    });
    return { success: true };
  }

  private detectPhoneColumn(columns: string[]): string | undefined {
    const phoneColumns = ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone', 'number', 'tel'];
    return columns.find(col => phoneColumns.includes(col.toLowerCase())) ?? columns[0];
  }

  private extractCustomFields(record: any, excludeKeys: string[]): any {
    const custom: any = {};
    for (const [key, value] of Object.entries(record)) {
      if (!excludeKeys.includes(key) && value) {
        custom[key] = value;
      }
    }
    return Object.keys(custom).length > 0 ? custom : undefined;
  }
}
