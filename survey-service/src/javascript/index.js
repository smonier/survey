import {registry} from '@jahia/ui-extender';

export default function () {
    registry.add('callback', 'survey-service', {
        targets: ['jahiaApp-init:50'],
        callback: async () => {
            const {default: register} = await import('./init');
            register();
        }
    });
}
