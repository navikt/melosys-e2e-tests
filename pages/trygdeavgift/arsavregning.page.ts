import {Page} from '@playwright/test';
import {BasePage} from '../shared/base.page';

export class ArsavregningPage extends BasePage {
    private readonly avgiftssystemetGroup = this.page.getByRole('group', {name: 'Skal du legge til trygdeavgift fra Avgiftssystemet'});
    private readonly skattepliktigGroup = this.page.getByRole('group', {name: 'Skattepliktig'});
    private readonly inntektskildeDropdown = this.page.getByLabel('Inntektskilde');
    private readonly bruttoinntektField = this.page.getByRole('textbox', {name: 'Bruttoinntekt'});
    private readonly bekreftButton = this.page.getByRole('button', {name: 'Bekreft og fortsett'});
    private readonly skjønnsfastsattCheckbox = this.page.getByRole('checkbox', {name: 'Inntektsgrunnlaget er skjø'});
    private readonly fattVedtakButton = this.page.getByRole('button', {name: 'Fatt vedtak'});

    constructor(page: Page) {
        super(page);
    }

    /**
     * Svar på "Skal du legge til trygdeavgift fra Avgiftssystemet til denne årsavregningen?"
     */
    async svarPåAvgiftssystemetSpørsmål(ja: boolean): Promise<void> {
        const svar = ja ? 'Ja' : 'Nei';
        await this.avgiftssystemetGroup.getByRole('radio', {name: svar}).check();
        console.log(`✅ Avgiftssystemet: ${svar}`);
    }

    async velgSkattepliktig(erSkattepliktig: boolean): Promise<void> {
        const radioLabel = erSkattepliktig ? 'Ja' : 'Nei';
        await this.skattepliktigGroup.getByLabel(radioLabel).check();
        console.log(`✅ Selected Skattepliktig = ${radioLabel}`);
    }

    async velgInntektskilde(inntektskilde: string): Promise<void> {
        await this.inntektskildeDropdown.selectOption(inntektskilde);
        console.log(`✅ Selected Inntektskilde = ${inntektskilde}`);
    }

    async fyllInnBruttoinntekt(beløp: string): Promise<void> {
        await this.bruttoinntektField.click();
        await this.bruttoinntektField.fill(beløp);
        console.log(`✅ Filled Bruttoinntekt = ${beløp}`);
    }

    async klikkBekreftOgFortsett(): Promise<void> {
        await this.bekreftButton.click();
    }

    async kryssAvSkjønnsfastsatt(): Promise<void> {
        await this.skjønnsfastsattCheckbox.check();
        console.log('✅ Checked Inntektsgrunnlaget er skjønnsfastsatt');
    }

    async klikkFattVedtak(): Promise<void> {
        await this.fattVedtakButton.click();
        console.log('✅ Clicked Fatt vedtak');
    }
}