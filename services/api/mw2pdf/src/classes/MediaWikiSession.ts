import puppeteer from 'puppeteer'
import {
  PdfFactory
} from './PdfFactory'
import {
  makeLoginRequest,
  makeLoginTokenRequest,
  extractLoginToken,
} from '../utils/mediaWiki'
import {
  parseCookies,
  ParsedCookie,
} from '../utils/cookies'
import {
  deletePdfs,
} from '../utils/files'
import { Pdf, PdfConstructorOptions } from './Pdf'
import { v4 } from 'uuid';
import { join } from 'path';


export const MwPdfMakeTitlePage: boolean = true;
export const MwPdfDoNoteMakeTitlePage: boolean = false;

export class MwPdfOptions {
  output: string | null;
  workDirectory: string;
  makeTitlePage: boolean;
  title: string;

  constructor(title: string, output?: string, workDirectory?: string, makeTitlePage: boolean = false) {
    this.title = title;
    this.output = output;
    this.workDirectory = workDirectory ? workDirectory : "./";
    this.makeTitlePage = makeTitlePage;
  }
}

export class MediaWikiSession {

  cookies: Map<string, Array<ParsedCookie>>;

  constructor() {
    this.cookies = new Map<string, Array<ParsedCookie>>();
  }

  isAuthenticated(domain) {
    return (domain in this.cookies);
  }

  /**
   * Remove any stored authentication cookies.
   */
  resetAuthentication(): void {
    this.cookies = new Map<string, Array<ParsedCookie>>();
  }

  getCookies(domain): Array<ParsedCookie> {
    return this.cookies[domain] ?? [];
  }

  setCookies(domain: string, cookies: Array<ParsedCookie>): void {
    this.cookies[domain] = cookies;
  }

  /**
   * Authenticate against a given api URL.
   * If the authentication has already occurred for a given domain, this will NOT re-authenticate.
   */
  async authenticate(username: string, password: string, apiUrl: URL): Promise<boolean> {
    const domain = apiUrl.host;
    if (this.isAuthenticated(domain)) {
      return true
    }

    // Step 1: Generate a login token
    const loginTokenRequest = await makeLoginTokenRequest(apiUrl)
    const authCookies = parseCookies(domain, loginTokenRequest)
    const loginToken = await extractLoginToken(loginTokenRequest)

    // Step 2: Perform the login
    const loginRequest = await makeLoginRequest(
      apiUrl,
      username,
      password,
      loginToken,
      authCookies,
    )

    // Step 3: Set the cookies for the session
    this.setCookies(
      domain,
      parseCookies(domain, loginRequest),
    )

    return true;
  }

  async makePdf(url: URL, options: MwPdfOptions): Promise<Pdf> {
    // Extract the domain (as _domain_) from the url.
    const domain = url.host;

    /**
     * Begin puppeteer
     */

    // Open the browser
    const browser = await puppeteer.launch(
      { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    );

    // Get a new page
    const page = await browser.newPage();

    // Set cookies into the browser that we pull from the MW session. This means
    // that all the login and authentication we did before will be valid.
    await page.setCookie(...this.getCookies(domain));

    // Now, go to the page!
    await page.goto(url.toString(), { waitUntil: 'networkidle2' });

    // Get the page's title.
    const pageTitle = await page.title()
    const pageFilename = join(options.workDirectory, `${v4()}.pdf`);

    // Generate a Pdf object with the appropriate title.
    const pagePdf: Pdf = PdfFactory.generatePdfObject(new PdfConstructorOptions(pageTitle, pageFilename));

    // print the visible page into a PDF
    await page.pdf({ path: pagePdf.filename, format: 'A4' });

    // close the browser
    await browser.close();

    /**
     * End puppeteer
     */


    // If the user wants a title page, let's make it!
    if (options.makeTitlePage) {
      const titlePagePdfFilename = join(options.workDirectory, `${v4()}.pdf`);
      const titlePagePdf = PdfFactory.generatePdfObject(new PdfConstructorOptions(pageTitle, titlePagePdfFilename));
      await PdfFactory.generateTitlePagePdf(pageTitle, titlePagePdf);

      const titlePageAndPagePdfFilename = join(options.workDirectory, `${v4()}.pdf`);
      const titlePageAndPagePdf = PdfFactory.generatePdfObject(new PdfConstructorOptions(pageTitle, titlePageAndPagePdfFilename));
      await PdfFactory.generateMergedPdf([titlePagePdf, pagePdf], titlePageAndPagePdf);

      await deletePdfs([titlePagePdf, pagePdf]);

      return titlePageAndPagePdf;
    }
    return pagePdf
  }

  async makePdfBooklet(urls: Array<URL>, options: MwPdfOptions): Promise<Pdf> {

    /**
     * Generate a temporary PDF for each URL. Each PDF should have a
     * title page to go with it.
     */
    const pagePdfs: Array<Pdf> = await Promise.all(
      urls.map(async (url) => {
        const pagePdfOptions = new MwPdfOptions("No Title", null, options.workDirectory, MwPdfMakeTitlePage);
        return this.makePdf(url, pagePdfOptions);
      }),
    )

    // Merge the page PDFs
    const mergedPagesPdfFilename  = join(options.workDirectory, `${v4()}.pdf` );
    const mergedPagesPdf = PdfFactory.generatePdfObject(new PdfConstructorOptions("No Title", mergedPagesPdfFilename));
    await PdfFactory.generateMergedPdf(pagePdfs, mergedPagesPdf);

    // Add page numbers to the merged PDF
    const numberedPagesPdfFilename = join(options.workDirectory, `${v4()}.pdf` );
    const numberedPagesPdf = PdfFactory.generatePdfObject(new PdfConstructorOptions("No Title", numberedPagesPdfFilename));
    await PdfFactory.generatePdfWithPageNumbers(mergedPagesPdf, numberedPagesPdf);

    // Generate the table of contents
    const tableOfContentsPdfFilename = join(options.workDirectory, `${v4()}.pdf` );
    const tableOfContentsPdf = PdfFactory.generatePdfObject(new PdfConstructorOptions("No Title", tableOfContentsPdfFilename));
    await PdfFactory.generateTableOfContentsPdf(pagePdfs, tableOfContentsPdf);

    // Merge the TOC with the page PDFs
    const finalPdfFilename = options.output ? options.output : join(options.workDirectory, `${v4()}.pdf` );
    const finalPdf = PdfFactory.generatePdfObject(new PdfConstructorOptions(options.title, finalPdfFilename));
    await PdfFactory.generateMergedPdf([tableOfContentsPdf, numberedPagesPdf], finalPdf);

    // Clean up temporary PDFs
    await deletePdfs([
      ...pagePdfs,
      mergedPagesPdf,
      numberedPagesPdf,
      tableOfContentsPdf,
    ]);

    return finalPdf;
  }
}
