/*
Copyright IBM Corporation 2017.
LICENSE: Apache License, Version 2.0
*/
import React, { Component } from 'react';
import { loadContent, getContent, subscribe } from '../';
import { getComponentByName, getComponentByLayout } from './'
import { withLayout } from './wchLayout';

export class WchContent extends Component {
	constructor(props) {
		super(props);

		this.state = {};

		this.sub = subscribe('content', (action, content) => {
			if (content && content.id === this.props.contentId) {
				this.setLayout(content, this.props.contentId, this.props.layoutId)
			}
		});
	}

	setLayout(content, id, layoutId = null) {
		//let content = getContent(this.props.contentId);
		if (content) {
			//let name = (content.selectedLayouts) ? content.selectedLayouts[0].layout.id.replace('-layout','') : content.type.toLowerCase().replace(' ', '-');
			let layout = layoutId || '';
			if (!layout) {
				if (content.selectedLayouts) {
					layout = content.selectedLayouts[0].layout.id;
				} else {
					layout = content.layouts.default.template;
				}
			}

			getComponentByLayout(layout).then(component => this.setState({ Component: component, renderingContext: content }))
				.catch(() => {
					let name = (content.selectedLayouts) ? content.selectedLayouts[0].layout.id.replace('-layout', '') : content.type.toLowerCase().replace(' ', '-');
					name = name.split('-').map(s => s.substring(0, 1).toUpperCase() + s.substring(1)).reduce((s, v) => s + v, '');

					if (name) {
						getComponentByName(name).then(component => this.setState({ Component: component, renderingContext: content }));
					}
				})

		} else {
			loadContent(id);
		}
	}

	componentWillReceiveProps(nextProp) {
		this.setLayout(getContent(nextProp.contentId), nextProp.contentId, nextProp.layoutId);
	}


	componentWillMount() {
		this.setLayout(getContent(this.props.contentId), this.props.contentId, this.props.layoutId);
	}


	componentWillUnmount() {
		this.sub.unsubscribe();
	}

	render() {
		if (this.state.Component) {
			return (<this.state.Component renderingContext={this.state.renderingContext} {...this.props} />);
		}

		return (<div></div>);
	}
}
