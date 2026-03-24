import {Page} from '@playwright/test';
import {BasePage} from '../shared/base.page';

/**
 * Page Object for annulling (cancelling) a behandling
 *
 * Responsibilities:
 * - Open behandlingsmeny
 * - Navigate to "Avslutt behandling"
 * - Select annullering reason and confirm
 *
 * @example
 * const annullering = new AnnulleringPage(page);
 * await annullering.annullerSak();
 */
export class AnnulleringPage extends BasePage {
    private readonly behandlingsmenyButton = this.page.getByRole('button', {name: 'Behandlingsmeny'});
    private readonly avsluttBehandlingButton = this.page.getByRole('button', {name: 'Avslutt behandling'});
    private readonly sakenErAnnullertButton = this.page.getByRole('button', {name: 'Saken er annullert'});
    private readonly bekreftButton = this.page.getByRole('button', {name: 'Bekreft', exact: true});

    constructor(page: Page) {
        super(page);
    }

    async åpneBehandlingsmeny(): Promise<void> {
        await this.behandlingsmenyButton.waitFor({state: 'visible'});
        await this.behandlingsmenyButton.click();
    }

    async klikkAvsluttBehandling(): Promise<void> {
        await this.avsluttBehandlingButton.waitFor({state: 'visible'});
        await this.avsluttBehandlingButton.click();
    }

    async velgSakenErAnnullert(): Promise<void> {
        await this.sakenErAnnullertButton.waitFor({state: 'visible'});
        await this.sakenErAnnullertButton.click();
    }

    async bekreft(): Promise<void> {
        await this.bekreftButton.waitFor({state: 'visible'});
        await this.bekreftButton.click();
    }

    /**
     * Complete annullering workflow:
     * Behandlingsmeny → Avslutt behandling → Saken er annullert → Bekreft
     */
    async annullerSak(): Promise<void> {
        console.log('Annullering: Opening behandlingsmeny...');
        await this.åpneBehandlingsmeny();
        await this.klikkAvsluttBehandling();
        await this.velgSakenErAnnullert();
        await this.bekreft();
        console.log('✅ Sak annullert');
    }
}