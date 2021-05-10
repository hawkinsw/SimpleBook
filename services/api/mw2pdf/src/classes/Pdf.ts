import fs from 'fs'
import { getDocument } from 'pdfjs-dist/es5/build/pdf'


export class PdfConstructorOptions {
  title: string;
  filename: string;

  constructor(title: string, filename: string) {
    this.title = title;
    this.filename = filename;
  }
}

export class PdfSize {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

export class PdfInfo {
  numPages: number;
  size: PdfSize;

  constructor(numPages: number, size: PdfSize) {
    this.numPages = numPages;
    this.size = size;
  }
}

export class Pdf {
  filename: string;
  title: string;

  constructor(options: PdfConstructorOptions) {
    this.filename = options.filename;
    this.title = options.title;
  }

  async getInfo(): Promise<PdfInfo> {
    const data = fs.readFileSync(this.filename);
    const pdf = await (getDocument(data).promise);
    const page = await pdf.getPage(1);
    return new PdfInfo(pdf.numPages, new PdfSize(page.view[2] as number, page.view[3] as number));
  }

  async delete(): Promise<void> {
    return await fs.promises.unlink(this.filename)
  }
}
