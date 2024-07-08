export function timeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export function replaceHtmlEntities(input: string): string {
    const entities: { [key: string]: string } = {
        '&#x27;': "'",
        '&amp;#x27;': "'",
        '&quot;': '"',
        '&amp;quot;': '"',
        '&lt;': '<',
        '&amp;lt;': '<',
        '&gt;': '>',
        '&amp;gt;': '>',
        '&nbsp;': ' ',
        '&amp;nbsp;': ' ',
        '&copy;': '©',
        '&amp;copy;': '©',
        '&reg;': '®',
        '&amp;reg;': '®',
        '&euro;': '€',
        '&amp;euro;': '€',
        '&amp;#x2F;': '/',
        '&#x2F;': '/',
        '\\\\': '\\', // Replace double backslash with a single backslash
        '\/': '/',   // Replace forward slash
        // '&amp;': '&', // Uncomment this if you need to replace '&' as well
    };

    return input.replace(/&#x27;|&amp;#x27;|&quot;|&amp;quot;|&lt;|&amp;lt;|&gt;|&amp;gt;|&nbsp;|&amp;nbsp;|&copy;|&amp;copy;|&reg;|&amp;reg;|&euro;|&amp;euro;|&amp;#x2F;|&#x2F;|\\\\|\//g, match => entities[match]);
}